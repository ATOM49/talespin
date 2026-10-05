# Talespin Watcher

`@talespin/watcher` is the Fastify generation boundary. It owns prompt templates, generation chains, provider/model selection, request validation, and MinIO coordination. It returns typed proposals; it does not persist authoritative game state.

Use the root [Local Development](../../docs/LOCAL_DEVELOPMENT.md) guide for the complete workspace, Docker, database, and worldbuilder setup.

## Environment

```bash
cp apps/watcher/.env.example apps/watcher/.env
```

The recommended complete workflow uses:

- `OPENAI_API_KEY` for structured text and image editing;
- `SEGMIND_API_KEY` for map, character, and faction image generation;
- local MinIO defaults from `.env.example` for generated media.

To use OpenAI for all image generation, set `AI_IMAGE_PROVIDER=openai`. Credentials stay server-side and must never be returned to worldbuilder or written to logs.

## Image Models

When `AI_IMAGE_PROVIDER=segmind`, watcher uses:

| Asset         | Default model   | Endpoint behavior                       |
| ------------- | --------------- | --------------------------------------- |
| Maps          | Nano Banana Pro | Square-aware, 2K PNG, image-only output |
| Character art | Seedream 4.5    | Portrait-aware, 2K, one image           |
| Faction art   | Ideogram 4.0    | Square HD PNG with prompt expansion     |

Override model slugs with `SEGMIND_MAP_MODEL`, `SEGMIND_CHARACTER_MODEL`, and `SEGMIND_FACTION_MODEL`. Structured text and image editing remain independently selectable; Segmind adapters for those modalities are not currently configured.

Ideogram prompt expansion remains enabled because the current live endpoint rejects `enable_prompt_expansion: false`.

## Generated Art Contract

Maps, factions, and characters share a high-fidelity cinematic pixel-art direction. Standalone routes and complete world-blueprint generation must stay consistent. Characters receive deterministic pose language and story-derived signature props while preserving identity across gallery angles.

Read [Generated Art Direction](../../docs/architecture/GENERATED_ART.md) before changing image prompts. Shared art language belongs in `src/prompts/pixel-art-direction.ts`; character diversity belongs in `src/prompts/character-variation.ts`.

## Development

Build shared consumers first, then start watcher:

```bash
pnpm build:schema
pnpm build:ai
pnpm build:cdn
pnpm dev:watcher
```

Watcher runs at <http://localhost:4000>. `curl http://localhost:4000/` should return `{"root":true}`.

Important routes are mounted under `/generate`:

- `POST /generate/world-blueprint`
- `POST /generate/map`
- `POST /generate/character`
- `POST /generate/faction`
- `POST /generate/faction-details`
- `POST /generate/edit-image`

Generated media is uploaded to MinIO. Cache identity includes provider, model, purpose, complete prompt, and requested size, so provider or prompt changes do not reuse unrelated assets.

## Shared Schemas

Use contracts from `@talespin/schema` and parse model output before returning it or crossing another trust boundary. After schema changes:

```bash
pnpm build:schema
pnpm build:watcher
```

## Verification

```bash
pnpm --filter @talespin/watcher test
pnpm build:watcher
pnpm lint
```

Prompt regression tests live under `apps/watcher/test/prompts/`. Keep pure prompt composers separate from provider-bound chains so tests do not require AI credentials.

## Durable recovery

Set `WATCHER_GENERATION_DATABASE_URL` as described in the
[local runbook](../../docs/LOCAL_DEVELOPMENT.md). Watcher stores infrastructure
checkpoints in MongoDB, reuses validated text/vision outputs and finished media,
and resumes Segmind v2 jobs by request ID. Failed required artwork leaves a
world job retryable instead of completing a world with missing assets.

`POST /generate/character` synthesizes profile and artwork;
`POST /generate/character-gallery` renders an existing character brief.
The endpoint registry lives in `@talespin/schema`.
See [Generation Recovery](../../docs/architecture/GENERATION_RECOVERY.md) for
leases, partial failures, and operator reconciliation.
