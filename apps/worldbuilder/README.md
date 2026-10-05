# Talespin Worldbuilder

`@talespin/worldbuilder` is the Next.js 15 UI and current application/persistence boundary. It owns Auth.js/NextAuth, builder/explorer authorization, API routes, Prisma services, MongoDB persistence, and calls to watcher.

Use the root [Local Development](../../docs/LOCAL_DEVELOPMENT.md) guide for the complete MongoDB, MinIO, watcher, and shared-package setup.

## Environment

```bash
cp apps/worldbuilder/.env.example apps/worldbuilder/.env
```

The template defaults to the development-only E2E credentials account. Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`, start the stack, then use **Continue with E2E account** and choose `BUILDER` during onboarding.

For production-like authentication, set `E2E_TEST_MODE=false` and configure both Google and Facebook credentials. Because the current auth module initializes both providers, all four OAuth values are required. Only `NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY` is browser-visible; database, auth, OAuth, and watcher values must remain server-side.

## Development

From the repository root:

```bash
pnpm build:schema
pnpm --filter @talespin/worldbuilder exec prisma generate
pnpm --filter @talespin/worldbuilder exec prisma db push
pnpm dev
```

Worldbuilder runs at <http://localhost:3000>, expects watcher at
`WATCHER_API_URL`, normally <http://localhost:4000>, and requires the separate
world-generation worker started by `pnpm dev`. Production process managers must
run `pnpm start:world-worker` alongside the web application.

## Authentication and Roles

- Sessions use the JWT strategy while users and provider accounts are stored through Prisma.
- New users must choose `BUILDER` or `EXPLORER` during onboarding.
- Builders can create and mutate worlds; explorers can browse but cannot use builder-only mutations.
- Authorization is enforced in server routes as well as hidden in the UI.

Inspect local records with:

```bash
pnpm --filter @talespin/worldbuilder exec prisma studio
```

## Prisma Changes

Prisma is the persistence representation, not the domain-contract source of truth. Update `packages/schema`, Prisma models, service DTO mappings, and affected API consumers together.

```bash
pnpm build:schema
pnpm --filter @talespin/worldbuilder exec prisma generate
pnpm --filter @talespin/worldbuilder exec prisma db push
```

MongoDB must have the `rs0` replica set initialized as described in the local-development guide.

## Verification

```bash
pnpm test:world
pnpm build:world
pnpm lint
```

For UI changes, verify both roles and capture screenshots. The root Playwright flow uses worldbuilder port `3100`, watcher port `4100`, and a development-only credentials provider:

```bash
pnpm test:e2e:install
pnpm test:e2e:local
```

The browser flow can invoke paid AI providers and writes artifacts under `test-results/`.
