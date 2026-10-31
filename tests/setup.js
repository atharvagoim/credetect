import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { testHooks } from '../server/services/messaging.js';
import { resetSourceConfigCache } from '../server/services/scanner.js';

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
  // Make the app's lazy connect reuse this server.
  process.env.MONGODB_URI = mongo.getUri();
  const { env } = await import('../server/config/env.js');
  env.MONGODB_URI = mongo.getUri();
});

beforeEach(async () => {
  testHooks.sent.length = 0;
  resetSourceConfigCache();
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDb();
  await mongo?.stop();
});
