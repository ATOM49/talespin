# Talespin AI Coding Instructions

## Project Overview

**Talespin** is a generative text game worldbuilding platform composed of three main components:

- **`worldbuilder`** (Next.js 15 + React 19): Frontend UI for creating/managing worlds, regions, locations, entities, and campaigns with AI-assisted map generation
- **`watcher`** (Fastify): Generation service owning prompts, typed proposals, media coordination, and infrastructure checkpoints
- **`@talespin/schema`** (Vite): Shared Zod schemas consumed by both apps for type safety and form rendering

## Architecture

### Monorepo Structure

- **pnpm workspace** with `apps/*` and `packages/*`
- Node v20.19.0+ + pnpm 10.13.1
- Shared schemas ensure consistency between frontend forms and backend validation

### Data Flow

1. User interacts with Next.js UI (`worldbuilder`)
2. Forms auto-generated from Zod schemas via `@autoform/zod` + `@autoform/react`
3. Next.js API routes (`/app/api/*/route.ts`) use Prisma to interact with MongoDB
4. For AI operations (map generation), Next.js server calls `watcher` API (`WATCHER_API_URL`)
5. `watcher` generates images via DALL-E → uploads to MinIO → returns public CDN URL

### Database & Storage

- **MongoDB** (via Prisma ORM): Primary datastore for worlds, regions, locations, entities, relationships, campaigns
- **MinIO** (S3-compatible): Local CDN for generated images; buckets have versioning + lifecycle policies
- Both services run via `docker-compose.yml`

## Development Workflows

### Starting the Project

```bash
# Start infrastructure
docker compose up -d

# Install dependencies (root)
pnpm install

# Run worldbuilder (Next.js on :3000)
pnpm dev:world

# Run watcher API (Fastify on :4000)
pnpm dev:watcher
```

### Database Changes

After editing `apps/worldbuilder/prisma/schema.prisma`:

```bash
cd apps/worldbuilder
pnpm dlx prisma generate  # Regenerate Prisma Client
pnpm dlx prisma db push    # Push schema to MongoDB
```

### Schema Changes

When modifying `packages/schema/src/*.ts`:

```bash
pnpm build:schema  # Rebuild package
# Both apps auto-detect changes via workspace: protocol
```

### Code Quality

- **Lint**: `pnpm lint` (ESLint with Prettier)
- **Format**: `pnpm format`
- **Commits**: Conventional commits enforced via commitlint + husky
- **Pre-commit**: lint-staged runs ESLint + Prettier on staged files

## Key Patterns & Conventions

### 1. Schema-Driven Development

All entities follow the same pattern (see `packages/schema/README.md`):

```typescript
// 1. Define base schema (shared validation rules)
export const EntityBaseSchema = z.object({
  /* ... */
});

// 2. Form schema (what users input)
export const EntityFormSchema = EntityBaseSchema;

// 3. Full schema (with DB fields)
export const EntitySchema = EntityBaseSchema.extend({
  _id: Id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 4. Export types
export type Entity = z.infer<typeof EntitySchema>;
export type EntityForm = z.infer<typeof EntityFormSchema>;
```

### 2. Form Rendering (worldbuilder)

Forms are auto-generated from Zod schemas:

```typescript
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '@/components/ui/autoform';
import { EntityFormSchema } from '@talespin/schema';

const schemaProvider = new ZodProvider(EntityFormSchema);
<AutoForm schema={schemaProvider} onSubmit={handleSubmit} withSubmit />
```

### 3. API Data Fetching (worldbuilder)

Use custom hooks for consistent server interaction:

```typescript
// GET requests
const { data, isLoading } = useApiQuery<EntityType>('/api/entities');

// POST/PUT/DELETE
const mutation = useApiMutation<Entity, Partial<Entity>>(
  'POST',
  '/api/entities',
  {
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] }),
  },
);
```

### 4. API Routes (worldbuilder)

Follow Next.js 15 App Router conventions:

```typescript
// apps/worldbuilder/src/app/api/entities/route.ts
import { EntityService } from '@/lib/api/entity.service';
import { EntityFormSchema } from '@talespin/schema';
import { handleApiError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const validated = EntityFormSchema.parse(data);
    const result = await new EntityService(prisma).createEntity(validated);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

> **Always** wrap API route logic in a `try/catch` that delegates to `handleApiError(error)` so responses stay consistent (validation, Prisma, and custom `ApiError` instances all flow through the same formatter).

### 5. Service Layer Pattern (worldbuilder)

Encapsulate business logic in service classes (see `apps/worldbuilder/src/lib/api/*.service.ts`):

- Constructor receives `PrismaClient`
- Private `mapToDto()` converts Prisma types to schema types
- Throw `ApiError(statusCode, message)` for HTTP errors

### 6. Fastify Plugins (watcher)

Fastify uses plugin architecture for reusable functionality:

- **`cdn.ts`**: MinIO uploads, exposes `fastify.cdn.uploadBuffer()`
- **`image-generation.ts`**: DALL-E wrapper, exposes `fastify.imageGen.generateMapToCdn()`
- **`cors.ts`, `sensible.ts`**: Standard middleware

### 7. Image Generation Flow

```typescript
// In watcher route (POST /generate/map)
const prompt = await mapPromptTemplate.format(world);
const { url } = await fastify.imageGen.generateMapToCdn({
  prompt,
  worldName: world.name,
  size: '1024x1024',
});
// Returns MinIO CDN URL

// In worldbuilder service
const imageUrl = await new ImageGenerationService().generateImageUrl(
  '/generate/map',
  worldData,
  WorldFormSchema,
);
// Uses the typed watcher client; durable jobs own retries
```

### 8. Coordinate System

All geographic data uses **relative coordinates** (`u`, `v` in `[0,1]`):

- **Locations**: `{ u: number, v: number }` (points)
- **Regions**: `{ outer: RelRing, holes?: RelRing[] }` (polygons)
- Canvas rendering scales to actual image dimensions dynamically

## Environment Variables

### worldbuilder (`.env`)

```env
DATABASE_URL="mongodb://localhost:27017/talespin?replicaSet=rs0"
WATCHER_API_URL="http://localhost:4000"  # Fastify backend
NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY="..."
```

### watcher (`.env`)

```env
OPENAI_API_KEY="sk-..."
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_BUCKET="images"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
```

## Common Tasks

### Adding a New Entity Type

1. Create schema in `packages/schema/src/my-entity.ts` (follow pattern in §1)
2. Export from `packages/schema/src/index.ts`
3. Add Prisma model to `apps/worldbuilder/prisma/schema.prisma`
4. Run `pnpm dlx prisma generate && pnpm dlx prisma db push`
5. Create service in `apps/worldbuilder/src/lib/api/my-entity.service.ts`
6. Create API route in `apps/worldbuilder/src/app/api/my-entities/route.ts`
7. Create form component in `apps/worldbuilder/src/components/form/my-entity.tsx`

### Debugging Issues

- **MongoDB connection**: Ensure `docker compose up -d` and replica set initialized
- **Image generation fails**: Check `OPENAI_API_KEY` in watcher, verify MinIO health at http://localhost:9001
- **Schema validation errors**: Ensure `pnpm build:schema` after schema changes
- **CORS errors**: Verify `WATCHER_API_URL` matches actual port (default 4000)

## Tech Stack Reference

- **Frontend**: Next.js 15, React 19, TanStack Query v4, Radix UI, Tailwind CSS 4, Fabric.js (canvas)
- **Backend**: Fastify 5, LangChain, OpenAI SDK 6.8
- **Data**: Prisma 6.19 (MongoDB support), MongoDB 7, Zod 3
- **Infrastructure**: Docker Compose, MinIO, pnpm workspaces
- **Runtime**: Node.js 20.19.0+
