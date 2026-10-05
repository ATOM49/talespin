import 'dotenv/config';
import { MongoGenerationStore } from '../services/mongo-generation-store.js';

const args = process.argv.slice(2);
const value = (flag: string) => args[args.indexOf(flag) + 1];
const uri = process.env.WATCHER_GENERATION_DATABASE_URL;
const step = args.includes('--step') ? value('--step') : undefined;
if (!uri || !step || !/^[a-f0-9]{64}$/.test(step)) {
  throw new Error(
    'Set WATCHER_GENERATION_DATABASE_URL and pass --step <checkpoint ID>',
  );
}
const store = new MongoGenerationStore(uri);
try {
  if (args.includes('--request-id')) {
    const requestId = value('--request-id');
    if (!requestId)
      throw new Error('--request-id needs the ID from the provider dashboard');
    await store.reconcile(step, requestId);
  } else if (
    args.includes('--confirm-not-submitted') ||
    args.includes('--confirm-result-unrecoverable')
  ) {
    await store.reconcile(step);
  }
  const record = await store.get(step);
  console.log({
    step,
    status: record?.status,
    requestId: record?.requestId,
    requestIds: record?.requestIds,
    leaseUntil: record?.leaseUntil,
  });
} finally {
  await store.close();
}
