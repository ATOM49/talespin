# Deployment

Local setup lives in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). This guide
covers the two supported production shapes: Vercel (one project with two
services) and containers.

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

Talespin deploys as **one Vercel project** using
[Vercel Services](https://vercel.com/docs/services). The root `vercel.json`
declares two services built from the same commit:

| Service   | Root                | Framework | Public route                    |
| --------- | ------------------- | --------- | ------------------------------- |
| `web`     | `apps/worldbuilder` | Next.js   | everything except `/_watcher/*` |
| `watcher` | `apps/watcher`      | Fastify   | `/_watcher/*` (prefix stripped) |

Each service's `buildCommand` builds the shared workspace packages it needs.
The watcher runs from `apps/watcher/src/server.ts`, which Vercel bundles into a
single function; do not add `build:watcher` to its build command, or Vercel
treats the compiled `dist/` as prebuilt output and picks the wrong entrypoint.

Project setup:

1. Import the repository at vercel.com/new and leave **Root Directory** empty
   (the repository root). Vercel detects the **Services** preset from
   `vercel.json`.
2. Keep **Fluid compute** on (the default for new projects).
3. Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in
   `package.json`, and use Node.js 22.x.

The `watcher` service is reachable publicly under `/_watcher`, so
`WATCHER_API_KEY` is what keeps generation private. The `web` service gets the
watcher's URL through a service binding (`WATCHER_API_URL`); set
`WATCHER_API_URL=https://<production-domain>/_watcher` explicitly as well, since
an explicit value always wins over the binding and keeps server-to-server calls
off protected preview URLs.

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
to 800 s (update the watcher's `maxDuration` in `vercel.json` and the route
exports if you upgrade). Hobby is also limited to non-commercial use.

### Environment variables

All variables live on the one project; both services read the ones they need.

| Variable                                                              | Used by | Value                                                                                                                          |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                        | web     | MongoDB connection string                                                                                                      |
| `NEXTAUTH_SECRET`                                                     | web     | Random 32+ byte secret                                                                                                         |
| `AUTH_URL`                                                            | web     | Public origin, e.g. `https://talespin.vercel.app` (Production only)                                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                            | web     | Google OAuth client; callback `https://<origin>/api/auth/callback/google`                                                      |
| `WATCHER_API_URL`                                                     | web     | `https://<production-domain>/_watcher`                                                                                         |
| `WATCHER_GENERATION_TIMEOUT_MS`                                       | web     | `240000` on Hobby                                                                                                              |
| `CRON_SECRET`                                                         | web     | Random secret; Vercel sends it to the cron route                                                                               |
| `WATCHER_API_KEY`                                                     | both    | Random secret; the watcher refuses to start without it in production                                                           |
| `MINIO_PUBLIC_BASE_URL` or `MINIO_PUBLIC_HOST` + `MINIO_BUCKET`       | both    | Public image origin                                                                                                            |
| `WATCHER_GENERATION_DATABASE_URL`                                     | watcher | MongoDB connection string for generation recovery (can be the same as `DATABASE_URL`); the watcher refuses to start without it |
| `OPENAI_API_KEY`, `SEGMIND_API_KEY`, `AI_*_PROVIDER`, model overrides | watcher | As in `apps/watcher/.env.example`                                                                                              |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION`       | watcher | Storage API endpoint                                                                                                           |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`                                | watcher | Storage credentials                                                                                                            |

Both OAuth providers are required at runtime; `E2E_TEST_MODE` is ignored in
production. `next/image` only optimizes images from the configured public
origin, and Vercel reads it at build time, so redeploy after changing it.
Every watcher route except `/` requires `Authorization: Bearer
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

Use the same environment variables as the Vercel table above, except
`CRON_SECRET` (containers run the workers instead) and
`WATCHER_GENERATION_TIMEOUT_MS`, which can stay at `300000`. The watcher
listens on `0.0.0.0` (port from `PORT`, default 4000) and still requires
`WATCHER_API_KEY`. The `MINIO_PUBLIC_*` build args become runtime defaults that
`docker run -e` can override.

`NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY` is inlined into client bundles, so
pass it as a build-time variable (a Docker build arg, or a Vercel environment
variable) when it is used.
