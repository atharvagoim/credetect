import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);
// NoSQL injection: every request input is parsed by a zod schema into primitive types
// before it reaches a query, and `$`/dotted keys are stripped from JSON bodies (sanitizeBody).
// Global sanitizeFilter is not used because it also neutralises our own operators.

const g = globalThis;
g.__pardaMongo ??= { conn: null, promise: null };

/** Cached connection: serverless functions reuse it across warm invocations. */
export async function connectDb(uri = env.MONGODB_URI) {
  if (g.__pardaMongo.conn && mongoose.connection.readyState === 1) return g.__pardaMongo.conn;
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not configured'), { status: 503, code: 'CONFIG_ERROR' });
  if (!g.__pardaMongo.promise) {
    g.__pardaMongo.promise = mongoose
      .connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000, autoIndex: true })
      .then((m) => {
        g.__pardaMongo.conn = m;
        return m;
      })
      .catch((err) => {
        g.__pardaMongo.promise = null;
        throw err;
      });
  }
  return g.__pardaMongo.promise;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  g.__pardaMongo = { conn: null, promise: null };
}
