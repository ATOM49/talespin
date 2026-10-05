import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import {
  GenerationIdSchema,
  WatcherContracts,
  type WatcherEndpoint,
} from '@talespin/models';
import {
  generationContext,
  type GenerationStore,
} from '../services/generation-recovery.js';
import { MongoGenerationStore } from '../services/mongo-generation-store.js';

export interface RecoveryOptions {
  store?: GenerationStore;
  databaseUrl?: string;
}
export default fp<RecoveryOptions>(
  async (fastify, options) => {
    const uri =
      options.databaseUrl ?? process.env.WATCHER_GENERATION_DATABASE_URL;
    if (!options.store && !uri)
      throw new Error(
        'WATCHER_GENERATION_DATABASE_URL is required for generation recovery',
      );
    const store = options.store ?? new MongoGenerationStore(uri!);
    if (store instanceof MongoGenerationStore)
      fastify.addHook('onClose', async () => store.close());
    fastify.addHook('onRequest', (request, reply, done) => {
      const endpoint = request.url
        .split('?')[0]
        .replace(/\/$/, '') as WatcherEndpoint;
      if (!(endpoint in WatcherContracts)) return done();
      const parsed = GenerationIdSchema.safeParse(
        request.headers['x-generation-id'] ?? randomUUID(),
      );
      if (!parsed.success) {
        void reply.code(400).send({ error: 'Invalid generation ID' });
        return;
      }
      generationContext.run(
        { scope: `${endpoint}:${parsed.data}`, store },
        done,
      );
    });
    fastify.addHook('preValidation', async (request, reply) => {
      const endpoint = request.url
        .split('?')[0]
        .replace(/\/$/, '') as WatcherEndpoint;
      if (!(endpoint in WatcherContracts)) return;
      const parsed = WatcherContracts[endpoint].request.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'Invalid generation request' });
      request.body = parsed.data;
    });
    fastify.addHook('preSerialization', async (request, reply, payload) => {
      const endpoint = request.url
        .split('?')[0]
        .replace(/\/$/, '') as WatcherEndpoint;
      if (!(endpoint in WatcherContracts) || reply.statusCode >= 400)
        return payload;
      const parsed = WatcherContracts[endpoint].response.safeParse(payload);
      if (!parsed.success) {
        reply.code(502);
        return { error: 'Generation response failed validation' };
      }
      return parsed.data;
    });
  },
  { name: 'generation-recovery' },
);
