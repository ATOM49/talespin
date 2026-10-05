# Models Package Instructions

`@talespin/models` is the canonical runtime-contract package. Read `../../docs/product/DOMAIN_MODEL.md` and `../../docs/product/GAME_CONTEXT.md` before adding narrative entities.

## Boundaries

- Keep this package independent of React, Next.js, Fastify, Prisma, LangChain, OpenAI, and storage clients.
- Use Zod for runtime validation and infer exported TypeScript types with `z.infer`.
- Preserve the existing `BaseSchema`, `FormSchema`, authoritative `Schema`, and inferred-type pattern where it fits.
- Export new public contracts from `src/index.ts`; follow the surrounding file's import-specifier style and preserve the ESM build output.
- Prefer discriminated unions for action, event, outcome, state-change, and lifecycle variants.
- Give persistent entities explicit IDs. Reference existing characters, worlds, locations, and missions instead of embedding regenerated copies.

## Current and Target Models

`World`, grid, character, faction, treasure-hunt, and exploration schemas are current. Story, Chapter, Mission, and Interaction contracts are implemented by explorer services and the pure game engine. Add new contracts only alongside real behavior and persistence plans. Do not rename `World`, `Campaign`, `TreasureHuntRun`, or `TreasureHuntEvent` to imply equivalence.

When a schema is persisted, update `../../apps/worldbuilder/prisma/schema.prisma` and its service DTO mapping in the same change. Generation-input/output schemas may differ from persisted schemas when trust boundaries differ.

## Verification

Install from the repository root with `pnpm install --frozen-lockfile`; this is an internal workspace package. Run `pnpm build:models`, then build or test affected consumers. If persistence changes, run Prisma generate and db push through the worldbuilder workspace as documented in `../../docs/LOCAL_DEVELOPMENT.md`. Add focused schema tests when introducing refinements, unions, defaults, or compatibility-sensitive parsing.
