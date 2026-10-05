# Local Development

This is the authoritative local setup for the Talespin monorepo. Commands run from the repository root unless stated otherwise.

## 1. Prerequisites

- Docker Desktop with Compose
- `nvm` or another Node version manager
- Node 20.19.0 from `.nvmrc`
- pnpm 10.13.1 from the root `packageManager` field

```bash
nvm install
nvm use
corepack enable
pnpm --version
pnpm install --frozen-lockfile
```

The expected pnpm version is `10.13.1`. If Corepack is unavailable, install it explicitly with `npm install --global pnpm@10.13.1`.

## 2. Server Environments

Create ignored local files from the committed templates:

```bash
cp apps/watcher/.env.example apps/watcher/.env
cp apps/worldbuilder/.env.example apps/worldbuilder/.env
```

### Watcher AI providers

The recommended setup uses Segmind for generated images and OpenAI for structured text and image editing:

```env
SEGMIND_API_KEY="..."
AI_IMAGE_PROVIDER=segmind

OPENAI_API_KEY="..."
AI_TEXT_PROVIDER=openai
AI_IMAGE_EDIT_PROVIDER=openai
```

Keep the model and MinIO defaults from `apps/watcher/.env.example`. Both API keys are required for the complete mixed-provider workflow. To use OpenAI for all image generation, set `AI_IMAGE_PROVIDER=openai`; `OPENAI_API_KEY` is then the only provider credential required.

### Worldbuilder authentication

Generate a secret and paste it into `apps/worldbuilder/.env`:

```bash
openssl rand -base64 32
```

`E2E_TEST_MODE=true` enables a local credentials account only when `NODE_ENV` is not `production`. This is the shortest development path and never belongs in a production environment.

For real OAuth, set `E2E_TEST_MODE=false` and configure both Google and Facebook credentials. The current auth module initializes both providers, so all four values are required:

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
FACEBOOK_CLIENT_ID="..."
FACEBOOK_CLIENT_SECRET="..."
```

Use these local callback URLs:

- Google: `http://localhost:3000/api/auth/callback/google`
- Facebook: `http://localhost:3000/api/auth/callback/facebook`

`NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY` is optional unless testing CopilotKit-assisted UI.

## 3. MongoDB and MinIO

Start the services declared in `docker-compose.yml`:

```bash
docker compose up -d
docker compose ps -a
```

MongoDB starts with replica-set mode enabled, but a fresh Docker volume must be initialized once. The following command is safe to rerun because it first checks `rs.status()`:

```bash
docker compose exec mongo mongosh --quiet --eval '
try { print("replica-set-ok=" + rs.status().ok) }
catch (error) {
  printjson(rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "localhost:27017" }]
  }))
}'
```

MinIO's one-off setup container creates the public `images` bucket. Confirm that `world-minio-setup` exited successfully with `docker compose ps -a`.

| Service                     | Local address               |
| --------------------------- | --------------------------- |
| MongoDB                     | `mongodb://localhost:27017` |
| MinIO API and public images | `http://localhost:9000`     |
| MinIO console               | `http://localhost:9001`     |

The checked-in MinIO credentials are local development defaults: `minioadmin` / `minioadmin`.

## 4. Build and Initialize

Workspace consumers import built `dist` exports from the shared packages. Build them after a fresh install:

```bash
pnpm build:schema
pnpm build:game-engine
pnpm build:ai
pnpm build:cdn
```

Generate Prisma Client and apply the MongoDB schema/indexes:

```bash
pnpm --filter @talespin/worldbuilder exec prisma generate
pnpm --filter @talespin/worldbuilder exec prisma db push
```

Repeat the relevant shared-package build after editing `packages/schema`,
`packages/game-engine`, `packages/ai`, or `packages/cdn`. After Prisma changes,
run both Prisma commands again. Existing grids can receive traversal metadata
without regeneration:

```bash
pnpm --filter @talespin/worldbuilder backfill:grid-traversal
```

The backfill is idempotent. Runtime normalization also keeps unbackfilled cells
playable.

## 5. Run the Applications

```bash
pnpm dev
```

This starts:

- `@talespin/worldbuilder` at <http://localhost:3000>
- the durable world-generation worker, which polls MongoDB for queued jobs
- the durable narrative worker, which polls MongoDB for Story and Mission jobs
- `@talespin/watcher` at <http://localhost:4000>

The worker is a separate long-running process. Production deployments must run
`pnpm start:world-worker` and `pnpm start:narrative-worker` (or equivalent
process commands) alongside the web application; web requests only enqueue or
retry jobs and never execute provider generation inline. Vercel deployments
are the exception: they run jobs inline after responses (see
[Deployment](DEPLOYMENT.md)).

Verify watcher independently:

```bash
curl http://localhost:4000/
```

The response should be `{"root":true}`. Sign in to worldbuilder, select the `BUILDER` role during onboarding, and create a world. A complete generation can take several minutes and incurs provider costs.

## 6. Verification

```bash
pnpm test:world
pnpm --filter @talespin/game-engine test
pnpm --filter @talespin/watcher test
pnpm --filter @talespin/cdn test
pnpm --filter @talespin/ai test
pnpm build
pnpm lint
```

The `CI` GitHub Actions workflow (`.github/workflows/ci.yml`) runs these same
checks on Node 20.19 for every pull request and push to `main`; it does not run
the browser flow below. OpenAI integration cases in `@talespin/ai` skip without
`OPENAI_API_KEY`. Treat focused tests, builds, and lint as separate claims from browser/provider verification.

For the browser flow:

```bash
pnpm test:e2e:install
pnpm e2e:prepare
pnpm exec playwright test e2e/story-game-loop.spec.ts
pnpm test:e2e:local
```

The focused Story command seeds a disposable four-by-four World and uses the
deterministic E2E narrative fixtures, so it verifies all three Chapters without
paid model calls. `pnpm test:e2e:local` runs the complete Playwright suite,
including the paid-provider world-generation flow. Playwright uses worldbuilder
port `3100` and watcher port `4100` and stores artifacts under `test-results/`.

## Troubleshooting

### Prisma reports transaction or replica-set errors

Run the replica-set initialization command from section 3, wait a few seconds, then rerun `prisma db push`.

### Watcher reports a missing provider key

Confirm `apps/watcher/.env` exists. Fastify CLI loads it from the watcher package directory. Mixed-provider generation needs both `SEGMIND_API_KEY` and `OPENAI_API_KEY`.

### Worldbuilder reports missing auth variables

For local development, confirm `E2E_TEST_MODE=true`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `AUTH_URL` in `apps/worldbuilder/.env`. When E2E mode is disabled, both Google and Facebook providers must be configured.

### MinIO uploads fail

```bash
docker compose up -d minio
docker compose up --no-deps minio-setup
docker compose logs minio minio-setup
```

### A shared import cannot resolve `dist`

Rebuild the owning package with `pnpm build:schema`,
`pnpm build:game-engine`, `pnpm build:ai`, or `pnpm build:cdn`.

## Shutdown and Data

```bash
docker compose down
```

This stops containers while retaining MongoDB and MinIO volumes. `docker compose down -v` permanently deletes local database and image data; use it only when intentionally resetting the environment.
