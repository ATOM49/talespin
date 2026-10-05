export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Concurrency limit must be a positive integer');
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;

  const runWorker = async () => {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index]!, index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  // Wait for sibling work to checkpoint before reporting a failure.
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;

  return results;
};
