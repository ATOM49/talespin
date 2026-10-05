import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';

export type StepStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'UNKNOWN';
export interface GenerationStep {
  _id: string;
  status: StepStatus;
  owner?: string;
  leaseUntil: Date;
  updatedAt: Date;
  requestId?: string;
  requestIds?: string[];
  result?: unknown;
  scope?: string;
  operation?: string;
  errorType?: string;
}
export interface GenerationStore {
  get(id: string): Promise<GenerationStep | null>;
  ensure(
    id: string,
    metadata?: { scope: string; operation: string },
  ): Promise<void>;
  claim(
    id: string,
    owner: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<GenerationStep | null>;
  update(
    id: string,
    owner: string,
    patch: Partial<GenerationStep>,
  ): Promise<void>;
}
export class GenerationRecoveryError extends Error {
  constructor(
    public readonly stepId: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(`${message} Recovery step: ${stepId}`);
    this.name = 'GenerationRecoveryError';
  }
}
export const generationContext = new AsyncLocalStorage<{
  scope: string;
  store: GenerationStore;
}>();
const LEASE_MS = 900_000;

/** Sort object keys so caller property order does not change recovery identity. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    !(item instanceof Date)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export const generationFingerprint = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');

export interface ProviderRecovery {
  requestId?: string;
  beforeSubmit(): Promise<void>;
  onSubmitted(requestId: string): Promise<void>;
}

/** Stores infrastructure checkpoints, never authoritative world or Story state. */
export async function recoverGeneration<T>(
  identity: unknown,
  run: (recovery: ProviderRecovery) => Promise<T>,
): Promise<T> {
  const context = generationContext.getStore();
  if (!context)
    return run({ beforeSubmit: async () => {}, onSubmitted: async () => {} });
  const id = generationFingerprint({
    version: 1,
    scope: context.scope,
    identity,
  });
  const store = context.store;
  await store.ensure(id, {
    scope: context.scope,
    operation:
      identity && typeof identity === 'object' && 'kind' in identity
        ? String(identity.kind)
        : 'generation',
  });
  const previous = await store.get(id);
  if (previous?.status === 'COMPLETED') return previous.result as T;
  if (
    previous?.status === 'UNKNOWN' ||
    (previous?.status === 'SUBMITTING' && previous.leaseUntil <= new Date())
  ) {
    throw new GenerationRecoveryError(
      id,
      'Provider submission requires reconciliation before retrying.',
    );
  }
  const owner = randomUUID();
  const record = await store.claim(
    id,
    owner,
    new Date(Date.now() + LEASE_MS),
    new Date(),
  );
  if (!record)
    throw new GenerationRecoveryError(
      id,
      'Generation step is already running. Retry after it finishes.',
    );
  let status = record.status;
  let requestId = record.requestId;
  const save = async (patch: Partial<GenerationStep>) => {
    await store.update(id, owner, { ...patch, updatedAt: new Date() });
    if (patch.status) status = patch.status;
  };
  const heartbeat = setInterval(() => {
    void save({ leaseUntil: new Date(Date.now() + LEASE_MS) }).catch(() => {});
  }, 30_000);
  heartbeat.unref();
  try {
    const result = await run({
      requestId,
      beforeSubmit: async () => {
        await save({ status: 'SUBMITTING' });
      },
      onSubmitted: async (submittedId) => {
        requestId = submittedId;
        await save({
          status: 'SUBMITTED',
          requestId,
          requestIds: [...(record.requestIds ?? []), submittedId],
        });
      },
    });
    await save({ status: 'COMPLETED', result, leaseUntil: new Date(0) });
    return result;
  } catch (error) {
    const terminal =
      error instanceof Error && error.name === 'SegmindInferenceError';
    const rejected =
      error instanceof Error &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status >= 400 &&
      error.status < 500;
    // Timeouts, failed downloads and failed uploads retain the ID. A provider
    // terminal failure is the only submitted job eligible for a fresh request.
    const nextStatus: StepStatus =
      terminal || (!requestId && rejected)
        ? 'FAILED'
        : requestId
          ? 'SUBMITTED'
          : status === 'SUBMITTING'
            ? 'UNKNOWN'
            : 'FAILED';
    await save({
      status: nextStatus,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      leaseUntil: new Date(0),
      ...(terminal ? { requestId: undefined } : requestId ? { requestId } : {}),
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/** Failure waits for in-flight siblings to persist their successful work. */
export async function settleGeneration<T extends readonly unknown[]>(tasks: {
  [K in keyof T]: Promise<T[K]>;
}): Promise<T> {
  const settled = await Promise.allSettled(tasks);
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return settled.map((result) =>
    result.status === 'fulfilled' ? result.value : undefined,
  ) as unknown as T;
}
