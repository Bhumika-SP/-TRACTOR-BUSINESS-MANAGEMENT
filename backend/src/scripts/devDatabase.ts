/**
 * LOCAL DEVELOPMENT ONLY: starts a single-node MongoDB replica set (transactions need one)
 * with no installation required. Data is kept in backend/.devdb between runs.
 *
 *   npm run dev:db        (keep this terminal open)
 *   then in .env:  MONGODB_URI=mongodb://127.0.0.1:27018/tractor_tracker?replicaSet=rs0
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const dbPath = path.resolve(__dirname, '../../.devdb');
  mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: 27018, dbPath }],
  });
  console.log('Local MongoDB replica set is running.');
  console.log('MONGODB_URI=mongodb://127.0.0.1:27018/tractor_tracker?replicaSet=rs0');
  console.log('Demo data: DEMO_MONGODB_URI=mongodb://127.0.0.1:27018/tractor_tracker_demo?replicaSet=rs0');
  console.log('Press Ctrl+C to stop.');
  const stop = async () => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
