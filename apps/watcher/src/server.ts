// Standalone HTTP entry for the watcher. Vercel Services runs this file (its
// Fastify builder captures the listen() call); fastify-cli still drives local
// development and the container image via app.ts.
import Fastify from 'fastify';
import app from './app.js';

const server = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

await server.register(app);
await server.listen({
  port: Number(process.env.PORT ?? 4000),
  host: '0.0.0.0',
});
