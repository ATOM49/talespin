# Watcher Service Instructions

`@talespin/watcher` is the server-side Fastify generation boundary. It owns HTTP generation routes, prompt templates, LangChain chain composition, model/CDN coordination, and validation of generated results.

Read `../../docs/architecture/ARCHITECTURE.md` and `../../docs/architecture/LANGGRAPH.md` before adding orchestration. Read `../../docs/architecture/GENERATED_ART.md` before changing image prompts or provider-purpose mappings. Use `../../docs/LOCAL_DEVELOPMENT.md` for the complete local stack.

## Rules

- Keep route handlers narrow: validate input, invoke a chain/service, validate output, map errors, and reply.
- Reuse contracts from `@talespin/schema`; do not maintain an avoidable second domain schema in route JSON definitions.
- Parse model output with Zod before returning it or passing it to another boundary.
- Keep large or reusable prompts in `src/prompts/` and composition in `src/chains/`.
- Keep the shared pixel-art contract in `src/prompts/pixel-art-direction.ts` and character distinction/staging in `src/prompts/character-variation.ts`. Update standalone and world-blueprint map, faction, and character paths together.
- Keep pure prompt composers out of provider-bound chain modules so regression tests do not initialize model configuration.
- Keep reusable provider mechanics in `@talespin/ai` and MinIO/image operations in `@talespin/cdn`.
- Do not persist or directly mutate authoritative game state from a generation chain. Return typed proposals to the application/gameplay boundary.
- Put deterministic rules in pure TypeScript functions and, once broader mission logic exists, move them to the game-engine boundary described in the architecture docs.
- Read `OPENAI_API_KEY`, `SEGMIND_API_KEY`, and MinIO credentials only server-side; never include secrets in logs or responses. The recommended mixed local setup needs both provider keys.

LangGraph is not currently installed. Adopt it only for a concrete branching or interrupt/resume workflow, with typed graph state and mocked routing tests.

## Verification

After a fresh install, build `schema`, `ai`, and `cdn` before watcher because it consumes their `dist` exports. Place tests under `test/**/*.test.ts`; prompt tests belong under `test/prompts/`. Run `pnpm --filter @talespin/watcher test`, `pnpm build:watcher`, and `pnpm lint` for watcher changes.
