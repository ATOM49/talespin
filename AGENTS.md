# Repository Guidelines

## Product Context

Talespin currently provides worldbuilding tools: builders create worlds, maps, factions, species, characters, and generated artwork. The repository also contains early persistent-play contracts for treasure-hunt runs and events.

The product direction is a persistent generative narrative game in which an LLM behaves as a game master over structured state. The target hierarchy is:

```text
Story -> Chapter -> Mission -> Interaction
```

The explorer implements this hierarchy through durable jobs and deterministic rules. Preserve the distinct older concepts: `World` is a setting, `Campaign` is an early route/goal contract, `TreasureHuntRun` is a concrete gameplay-loop precedent, and `TreasureHuntEvent` is an event/interaction analogue.

Read these before changing product or architecture boundaries:

- `docs/product/GAME_CONTEXT.md`
- `docs/product/DOMAIN_MODEL.md`
- `docs/product/GAMEPLAY_LOOP.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/EXPLORER.md` before changing explorer routes, player
  identity, Story/Mission/Interaction behavior, or gameplay orchestration
- `docs/architecture/GENERATED_ART.md` before changing image generation or prompts
- `docs/architecture/LANGGRAPH.md`
- `docs/architecture/DECISIONS.md`

## Workspace Responsibilities

- `apps/worldbuilder`: Next.js UI, authentication, API routes, Prisma services, and the current MongoDB persistence boundary.
- `apps/watcher`: Fastify generation service; owns prompts, generation chains, request validation, CDN coordination, and infrastructure-only generation checkpoints.
- `packages/models`: canonical Zod contracts and inferred TypeScript types.
- `packages/game-engine`: pure Mission, outcome, objective, terrain, and travel rules.
- `packages/ai`: low-level LangChain/OpenAI runnables. Keep product prompts and game rules out.
- `packages/cdn`: MinIO and image-processing infrastructure.

`packages/game-engine` owns pure gameplay rules. There is no standalone agent-graph or persistence package; add one only with working behavior and consumers.

## Architecture Rules

Prefer this boundary for gameplay:

```text
LLM proposes -> Zod validates -> deterministic rules evaluate
-> state transition applies -> state persists
```

An LLM must not directly replace or mutate arbitrary authoritative state. Keep deterministic rules in TypeScript, persistence outside domain contracts, and prompts outside reusable provider adapters. If LangGraph is introduced, use it for orchestration and interrupt/resume flow, not as the domain model.

When changing persistent gameplay behavior, check the shared schema, transition logic, orchestration, Prisma mapping, API authorization, and tests. Keep `packages/models` free of React, Prisma, Fastify, LangChain, and provider dependencies.

## Build, Test, and Development

Use Node 20.19.0 (`.nvmrc`) and pnpm 10.13.1.
`docs/LOCAL_DEVELOPMENT.md` is the authoritative setup guide; keep README setup snippets aligned with it.

- `pnpm install --frozen-lockfile`: install the pinned workspace dependency graph.
- Copy both committed templates to ignored files: `apps/watcher/.env` and `apps/worldbuilder/.env`.
- `docker compose up -d`: start MongoDB and MinIO. Initialize `rs0` once for each fresh Mongo volume as documented in `docs/LOCAL_DEVELOPMENT.md`.
- Run `pnpm build:models`, `pnpm build:game-engine`, `pnpm build:ai`, and `pnpm build:cdn` after a fresh install because consumers import built `dist` exports.
- Generate Prisma Client and apply schema/index changes with `pnpm --filter @talespin/worldbuilder exec prisma generate` and `pnpm --filter @talespin/worldbuilder exec prisma db push`.
- `pnpm dev`: run worldbuilder on port 3000, the world-generation worker, and watcher on port 4000.
- `pnpm build`: build shared packages and both apps.
- `pnpm lint`: run workspace ESLint and Prettier checks.
- `pnpm format`: format supported files.
- `pnpm --filter @talespin/watcher test`: run Fastify tests.
- `pnpm --filter @talespin/ai test`: run Vitest integration tests; OpenAI cases require `OPENAI_API_KEY` and skip without it.
- `pnpm test:e2e:local`: run the paid-provider browser flow on ports 3100/4100; do not describe this as a mocked or free test.

Use TypeScript, two-space indentation, and single quotes. Follow nearby filename conventions; use PascalCase for React components/types, `useX` for hooks, and `*Schema` for Zod schemas.

## Commits, Reviews, and Secrets

Use Conventional Commits, for example `feat(worldbuilder): add mission view`. PRs should name affected workspaces, explain state/schema migrations, list verification, link issues, and include screenshots for UI changes. Add a Changeset when a versioned package release requires one.

Keep secrets in ignored `.env` files. Commit only empty/local-only `.env.example` templates. Never commit database URLs, auth secrets, provider tokens, or non-local MinIO credentials.
