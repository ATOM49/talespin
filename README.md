# Talespin

Talespin is a collaborative worldbuilding application for creating persistent worlds, maps, regions, factions, characters, and generated artwork. The current product is a builder; the longer-term direction is a stateful generative narrative game. See [Game Context](docs/product/GAME_CONTEXT.md) for the current-versus-target distinction.

## Workspace

| Path                | Responsibility                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `apps/worldbuilder` | Next.js UI, authentication, API routes, Prisma, and MongoDB persistence         |
| `apps/watcher`      | Fastify generation service, prompts, image/text providers, and CDN coordination |
| `packages/schema`   | Canonical Zod contracts and inferred TypeScript types                           |
| `packages/ai`       | Reusable OpenAI and Segmind provider adapters                                   |
| `packages/cdn`      | MinIO storage and Sharp image utilities                                         |

## Local Quick Start

Requirements: Docker Desktop, Node 20.19.0, and pnpm 10.13.1.

```bash
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile

cp apps/watcher/.env.example apps/watcher/.env
cp apps/worldbuilder/.env.example apps/worldbuilder/.env
```

Add your provider keys to `apps/watcher/.env`, generate a `NEXTAUTH_SECRET` for `apps/worldbuilder/.env`, then start the infrastructure:

```bash
docker compose up -d
docker compose exec mongo mongosh --quiet --eval '
try { print("replica-set-ok=" + rs.status().ok) }
catch (error) {
  printjson(rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "localhost:27017" }]
  }))
}'
```

Build workspace dependencies and initialize Prisma:

```bash
pnpm build:schema
pnpm build:game-engine
pnpm build:ai
pnpm build:cdn
pnpm --filter @talespin/worldbuilder exec prisma generate
pnpm --filter @talespin/worldbuilder exec prisma db push
```

Run both applications and the generation worker:

```bash
pnpm dev
```

- Worldbuilder: <http://localhost:3000>
- World-generation worker: polls MongoDB for queued or interrupted jobs
- Narrative worker: prepares Stories, Missions, Interactions, and outcomes
- Watcher: <http://localhost:4000> (returns `{"root":true}`)
- MinIO console: <http://localhost:9001> (`minioadmin` / `minioadmin` locally)

Use the development-only **Continue with E2E account** option, choose the `BUILDER` role, and create a world. Generation uses paid AI APIs.

Read [Local Development](docs/LOCAL_DEVELOPMENT.md) for environment choices, real OAuth, verification, troubleshooting, E2E tests, and shutdown instructions.

## Common Commands

```bash
pnpm dev                                  # worldbuilder + both workers + watcher
pnpm build                                # all packages and applications
pnpm lint                                 # workspace ESLint
pnpm test:world                           # world-generation job tests
pnpm --filter @talespin/game-engine test  # deterministic travel and state rules
pnpm --filter @talespin/watcher test      # watcher tests
pnpm --filter @talespin/ai test           # provider package tests
pnpm e2e:prepare                          # local services, builds, Prisma sync
pnpm exec playwright test e2e/story-game-loop.spec.ts # fixture Story browser flow
pnpm test:e2e:local                       # paid-provider browser flow
```

When changing `packages/schema`, `packages/game-engine`, `packages/ai`, or
`packages/cdn`, rebuild that package before running a consuming application.

## Documentation

- [Local Development](docs/LOCAL_DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Product Context](docs/product/GAME_CONTEXT.md)
- [Domain Model](docs/product/DOMAIN_MODEL.md)
- [Gameplay Loop](docs/product/GAMEPLAY_LOOP.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Generated Art Direction](docs/architecture/GENERATED_ART.md)
- [Architecture Decisions](docs/architecture/DECISIONS.md)
- [LangGraph Direction](docs/architecture/LANGGRAPH.md)

## Secrets

Keep credentials in ignored `.env` files. Commit only `.env.example` templates with empty or local-only values. Never expose provider, database, OAuth, or storage secrets through `NEXT_PUBLIC_*` variables.
