import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env file */
}

/**
 * In development the Express API is mounted inside the Vite dev server, so
 * `npm run dev` runs the whole app on one origin (http://localhost:5173),
 * exactly like production on Vercel. MONGODB_URI (see .env) is required.
 */
function apiDevServer() {
  return {
    name: 'parda-api',
    apply: 'serve',
    async configureServer(server) {
      // Vite restarts the server in the same process when .env changes. Drop the previous
      // run's cached DB connection so the new settings apply.
      const g = globalThis;
      if (g.__pardaMongo) {
        const { default: mongoose } = await import('mongoose');
        await mongoose.disconnect().catch(() => {});
        g.__pardaMongo = { conn: null, promise: null };
      }
      // loadEnvFile never overwrites existing variables, so values from before an edit (even empty ones)
      // would survive the restart. Parse the file and overwrite instead.
      try {
        const { parseEnv } = await import('node:util');
        const { readFileSync } = await import('node:fs');
        Object.assign(process.env, parseEnv(readFileSync('.env', 'utf8')));
      } catch {
        /* no .env file */
      }
      if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env.');
      // ssrLoadModule re-evaluates server code per dev-server instance, so config/env.js re-reads process.env.
      const { default: app } = await server.ssrLoadModule('/server/app.js');
      server.middlewares.use((req, res, next) => (req.url.startsWith('/api') ? app(req, res, next) : next()));
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
});
