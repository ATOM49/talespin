// Vercel Function entry: serves the Fastify app built into dist/ for every
// path (see vercel.json rewrites). Docker and local runs use fastify-cli.
import type { IncomingMessage, ServerResponse } from 'node:http';
import Fastify from 'fastify';
import app from '../dist/app.js';

const server = Fastify({ logger: { level: 'info' } });
void server.register(app);
const ready = server.ready();

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await ready;
  server.server.emit('request', request, response);
}
