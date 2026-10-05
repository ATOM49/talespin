import { FastifyPluginAsync, FastifyServerOptions } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import auth from './plugins/auth.js';
import cdn, { type CDNPluginOptions } from './plugins/cdn.js';
import cors from './plugins/cors.js';
import imageGeneration, {
  type ImageGenOptions,
} from './plugins/image-generation.js';
import sensible from './plugins/sensible.js';
import generateRoutes from './routes/generate/index.js';
import root from './routes/root.js';

export interface AppOptions extends FastifyServerOptions {
  cdn?: CDNPluginOptions;
  imageGen?: ImageGenOptions;
}

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
  cdn: {
    bucket: process.env.MINIO_BUCKET, // optional; defaults to "images"
    publicHost: process.env.MINIO_PUBLIC_HOST, // optional; defaults to http://localhost:9000
  },
  imageGen: {
    defaultSize: '1024x1024',
  },
};

// Plugins and routes are registered explicitly (not autoloaded from disk) so
// serverless bundlers such as Vercel's can trace every module.
const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  await typed.register(sensible);
  await typed.register(cors);
  await typed.register(auth);
  await typed.register(cdn, opts.cdn ?? {});
  await typed.register(imageGeneration, opts.imageGen ?? {});

  await typed.register(root);
  await typed.register(generateRoutes, { prefix: '/generate' });
};

export default app;
export { app, options };
