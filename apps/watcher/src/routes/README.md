# Watcher Routes

Routes are the HTTP boundary around validated generation chains. Keep handlers narrow: validate input, invoke a chain/service, validate output, translate known failures, and reply. Do not persist authoritative game state here.

## Current Endpoints

- `GET /`: lightweight process check returning `{"root":true}`.
- `POST /generate/world-blueprint`: coherent world, map, regions, factions, characters, and assignments proposal.
- `POST /generate/map`: standalone map image generation.
- `POST /generate/character`: generated character profile and image gallery.
- `POST /generate/faction`: standalone faction image generation.
- `POST /generate/faction-details`: structured faction details.
- `POST /generate/edit-image`: polygon-based image edit.

Generation routes are registered in `generate/index.ts`. Reuse contracts from `@talespin/schema`; avoid maintaining a second domain schema in route code where a shared contract exists.

Prompt templates belong in `src/prompts/` and composition belongs in `src/chains/`. Provider and CDN mechanics belong in plugins or shared packages. Read [Generated Art Direction](../../../../docs/architecture/GENERATED_ART.md) before changing image-generation behavior.

## Local Use and Verification

Follow [Local Development](../../../../docs/LOCAL_DEVELOPMENT.md), then run:

```bash
pnpm --filter @talespin/watcher test
pnpm build:watcher
```
