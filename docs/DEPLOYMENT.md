# Deployment

Local setup lives in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). This guide
covers the two supported production shapes: Vercel (two projects) and
containers.

## Services Outside the Apps

Both shapes need the same external services:

- **MongoDB replica set.** MongoDB Atlas works (also available through the
  Vercel Marketplace). Prisma transactions require a replica set, which Atlas
  always provides. Apply indexes after schema changes with
  `DATABASE_URL=... pnpm --filter @talespin/worldbuilder exec prisma db push`.
- **S3-compatible object storage with public reads** for generated art, for
  example Cloudflare R2, AWS S3 or a hosted MinIO. See
  [Object Storage](#object-storage).
- **Provider keys** for OpenAI and optionally Segmind.

## Vercel

Create two Vercel projects from this repository, one per app. Vercel installs
the whole pnpm workspace; each `vercel.json` builds the shared packages first.

| Project      | Root Directory      | Config                          |
| ------------ | ------------------- | ------------------------------- |
| worldbuilder | `apps/worldbuilder` | `apps/worldbuilder/vercel.json` |
| watcher      | `apps/watcher`      | `apps/watcher/vercel.json`      |

For both projects:

- Keep **Fluid compute** on (the default for new projects).
- Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in
  `package.json`.
- Use Node.js 22.x.

### How jobs run on Vercel

Vercel cannot keep the two worker processes running. On Vercel the worldbuilder
runs generation jobs **inline**: routes that enqueue jobs or that the UI polls
call `scheduleGenerationJobs()`, which drains the queue after the response
within the route's 300 s limit. Leases keep concurrent runs safe, and polling
picks up any job whose lease expired. `/api/internal/generation-jobs` is a
daily cron backstop (Hobby allows one run per day) protected by
`CRON_SECRET`. Set `GENERATION_JOB_RUNNER` to override the default (`inline`
on Vercel, `worker` elsewhere).

Hobby caps every function at 300 s, including the watcher request that
generates a whole world. Keep `WATCHER_GENERATION_TIMEOUT_MS` at or below
`240000` so the worldbuilder gives up before the platform kills the function;
a job that still times out can be retried from the UI. Large worlds (many
regions, factions and characters) may not fit; the Pro plan raises the limit
to 800 s (update `maxDuration` in both `vercel.json` files and the route
exports if you upgrade). Hobby is also limited to non-commercial use.

### Worldbuilder environment

| Variable                                                        | Value                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                                                  | MongoDB connection string                                                  |
| `NEXTAUTH_SECRET`                                               | Random 32+ byte secret                                                     |
| `AUTH_URL`                                                      | Public origin, e.g. `https://talespin.vercel.app`                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                      | Google OAuth client; callback `https://<origin>/api/auth/callback/google`  |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`                  | Facebook OAuth app; callback `https://<origin>/api/auth/callback/facebook` |
| `WATCHER_API_URL`                                               | Watcher project URL, e.g. `https://talespin-watcher.vercel.app`            |
| `WATCHER_API_KEY`                                               | Same random secret as the watcher                                          |
| `WATCHER_GENERATION_TIMEOUT_MS`                                 | `240000` on Hobby                                                          |
| `CRON_SECRET`                                                   | Random secret; Vercel sends it to the cron route                           |
| `MINIO_PUBLIC_BASE_URL` or `MINIO_PUBLIC_HOST` + `MINIO_BUCKET` | Public image origin (same as the watcher)                                  |

Both OAuth providers are required at runtime; `E2E_TEST_MODE` is ignored in
production. `next/image` only optimizes images from the configured public
origin, and Vercel reads it at build time, so redeploy after changing it.

### Watcher environment

| Variable                                                              | Value                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `WATCHER_API_KEY`                                                     | Random secret; the watcher refuses to start without it in production |
| `OPENAI_API_KEY`, `SEGMIND_API_KEY`, `AI_*_PROVIDER`, model overrides | As in `apps/watcher/.env.example`                                    |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION`       | Storage API endpoint                                                 |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`                | Storage credentials and bucket                                       |
| `MINIO_PUBLIC_BASE_URL` or `MINIO_PUBLIC_HOST`                        | Public image origin                                                  |

The watcher is served by a single function (`api/index.ts`) that wraps the
Fastify app. Every route except `/` requires `Authorization: Bearer
<WATCHER_API_KEY>`.

## Object Storage

The watcher uploads through the MinIO client, which speaks the S3 API.

Cloudflare R2:

```env
MINIO_ENDPOINT=<account-id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=auto
MINIO_BUCKET=images
MINIO_PUBLIC_BASE_URL=https://<public-bucket-domain>
```

Enable public access on the bucket (an `r2.dev` URL or a custom domain) and use
that as `MINIO_PUBLIC_BASE_URL`, since R2 public URLs do not include the bucket
name. For path-style hosts such as MinIO, set `MINIO_PUBLIC_HOST` instead and
URLs become `<host>/<bucket>/<key>`.

## Containers

Two images build from the repository root:

```bash
docker build -f apps/worldbuilder/Dockerfile \
  --build-arg MINIO_PUBLIC_HOST=https://cdn.example.com \
  -t talespin-worldbuilder .

docker build -f apps/watcher/Dockerfile -t talespin-watcher .
```

Both run as the non-root `node` user on Node 20.19.0. No secrets are needed to
build; `.dockerignore` keeps local `.env` files out of the context.

| Process          | Image                   | Command                       | Port |
| ---------------- | ----------------------- | ----------------------------- | ---- |
| Web              | `talespin-worldbuilder` | default (`next start`)        | 3000 |
| World worker     | `talespin-worldbuilder` | `worker:world-generation`     | —    |
| Narrative worker | `talespin-worldbuilder` | `worker:narrative-generation` | —    |
| Watcher          | `talespin-watcher`      | default (`start:prod`)        | 4000 |

Apply Prisma indexes once per deploy:

```bash
docker run --rm -e DATABASE_URL=... talespin-worldbuilder exec prisma db push --skip-generate
```

Use the same environment variables as the Vercel tables above, except
`CRON_SECRET` (containers run the workers instead) and
`WATCHER_GENERATION_TIMEOUT_MS`, which can stay at `300000`. The watcher
listens on `0.0.0.0` (port from `PORT`, default 4000) and still requires
`WATCHER_API_KEY`. The `MINIO_PUBLIC_*` build args become runtime defaults that
`docker run -e` can override.

`NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY` is inlined into client bundles, so
pass it as a build-time variable (a Docker build arg, or a Vercel environment
variable) when it is used.
