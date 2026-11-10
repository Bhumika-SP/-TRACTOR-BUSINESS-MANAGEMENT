import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  // Make sure unique indexes (idempotency keys, usernames, etc.) exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
