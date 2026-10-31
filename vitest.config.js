import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      DATA_ENCRYPTION_KEY: 'test-encryption-key-0123456789abcdef0123456789',
      HMAC_SECRET: 'test-hmac-secret-0123456789abcdef0123456789abcdef',
      ADMIN_EMAILS: 'admin@example.com',
      CRON_SECRET: 'test-cron-secret',
      ENABLE_DEMO_ADAPTER: 'true',
      EMAIL_PREVIEW: 'false',
    },
  },
});
