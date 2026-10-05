import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';

export type AuthPluginOptions = {
  /** Shared secret callers send as `Authorization: Bearer <key>`. */
  apiKey?: string;
  /** Refuse to start without a key; defaults to true in production. */
  requireKey?: boolean;
};

// The root route stays open as a health check.
const PUBLIC_PATHS = new Set(['/']);

const matches = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Requires a shared secret on every generation request so only worldbuilder
 * can spend provider credits. Configure WATCHER_API_KEY in both apps.
 */
export default fp<AuthPluginOptions>(
  async (fastify, opts) => {
    const apiKey = opts.apiKey ?? process.env.WATCHER_API_KEY;
    const requireKey = opts.requireKey ?? process.env.NODE_ENV === 'production';

    if (!apiKey) {
      if (requireKey) {
        throw new Error('WATCHER_API_KEY must be set in production');
      }
      fastify.log.warn(
        'WATCHER_API_KEY is not set; generation routes are unauthenticated',
      );
      return;
    }

    const expected = `Bearer ${apiKey}`;
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.method === 'OPTIONS') return; // CORS preflight
      if (PUBLIC_PATHS.has(request.url.split('?')[0])) return;
      const provided = request.headers.authorization ?? '';
      if (!matches(provided, expected)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  },
  { name: 'auth' },
);
