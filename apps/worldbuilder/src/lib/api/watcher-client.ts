/**
 * Headers for server-side calls to apps/watcher. WATCHER_API_KEY must match
 * the watcher's value; it is never exposed to the browser.
 */
export const watcherHeaders = (): Record<string, string> => {
  const apiKey = process.env.WATCHER_API_KEY;
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
};
