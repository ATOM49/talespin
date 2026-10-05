import { MongoClient, type Collection } from 'mongodb';
import {
  GenerationRecoveryError,
  type GenerationStep,
  type GenerationStore,
} from './generation-recovery.js';

/** A separate infrastructure collection; no reads or writes of game entities. */
export class MongoGenerationStore implements GenerationStore {
  private readonly client: MongoClient;
  private collectionPromise?: Promise<Collection<GenerationStep>>;
  constructor(uri: string) {
    this.client = new MongoClient(uri, {
      writeConcern: { w: 'majority' },
      ignoreUndefined: true,
      serverSelectionTimeoutMS: 10000,
    });
  }
  private collection() {
    this.collectionPromise ??= this.client
      .connect()
      .then((client) =>
        client.db().collection<GenerationStep>('GenerationCheckpoint'),
      )
      .catch((error) => {
        this.collectionPromise = undefined;
        throw error;
      });
    return this.collectionPromise;
  }
  async get(id: string) {
    return (await this.collection()).findOne({ _id: id });
  }
  async ensure(id: string, metadata?: { scope: string; operation: string }) {
    try {
      await (
        await this.collection()
      ).updateOne(
        { _id: id },
        {
          $setOnInsert: {
            ...metadata,
            status: 'READY',
            leaseUntil: new Date(0),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (
        !(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 11000
        )
      )
        throw error;
    }
  }
  async claim(id: string, owner: string, leaseUntil: Date, now: Date) {
    return (await this.collection()).findOneAndUpdate(
      {
        _id: id,
        status: { $in: ['READY', 'FAILED', 'RUNNING', 'SUBMITTED'] },
        leaseUntil: { $lte: now },
      },
      { $set: { owner, leaseUntil, updatedAt: now, status: 'RUNNING' } },
      { returnDocument: 'after' },
    );
  }
  async update(id: string, owner: string, patch: Partial<GenerationStep>) {
    const { requestId, ...values } = patch;
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: id, owner },
      {
        $set: { ...values, ...(requestId !== undefined ? { requestId } : {}) },
        ...('requestId' in patch && requestId === undefined
          ? { $unset: { requestId: '' } }
          : {}),
      },
    );
    if (result.matchedCount !== 1)
      throw new GenerationRecoveryError(id, 'Generation lease was superseded.');
  }
  async reconcile(id: string, requestId?: string) {
    if (requestId && !/^[A-Za-z0-9._-]+$/.test(requestId))
      throw new Error('Invalid provider request ID');
    const result = await (
      await this.collection()
    ).updateOne(
      {
        _id: id,
        status: { $in: ['UNKNOWN', 'SUBMITTING'] },
        leaseUntil: { $lte: new Date() },
      },
      {
        $set: {
          status: requestId ? 'SUBMITTED' : 'FAILED',
          leaseUntil: new Date(0),
          updatedAt: new Date(),
          ...(requestId ? { requestId } : {}),
        },
        ...(requestId
          ? { $addToSet: { requestIds: requestId } }
          : { $unset: { requestId: '' } }),
      },
    );
    if (result.matchedCount !== 1)
      throw new Error(
        'Only an expired unresolved submission can be reconciled',
      );
  }
  async close() {
    await this.client.close();
  }
}
