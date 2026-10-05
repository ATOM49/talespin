# @talespin/schema

A centralized schema management package that provides type-safe validation and form rendering across the Talespin application. Built with [Zod](https://zod.dev/), this package ensures data consistency between the `watcher` service (validation) and `worldbuilder` UI (form rendering).

## Purpose

- **Validation**: Validates API request/response models in the `watcher` Fastify service
- **Form Rendering**: Generates type-safe forms in the `worldbuilder` Next.js application
- **Type Safety**: Provides TypeScript types across the entire monorepo
- **Single Source of Truth**: Centralized schema definitions prevent schema drift

## Tech Stack

- **Zod**: Schema validation and type inference
- **TypeScript**: Type definitions and compile-time safety
- **Vite**: Fast build tooling

## Workspace Setup

This is an internal package linked through the Talespin pnpm workspace. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build:schema
```

See [Local Development](../../docs/LOCAL_DEVELOPMENT.md) for the complete application, database, and provider setup.

## Adding a New Entity

Follow these steps to add a new entity schema:

### 1. Create the Schema File

Create a new TypeScript file in `src/`:

```typescript
// src/my-entity.ts
import { z } from 'zod';
import { Id } from './common';

export const MyEntityBaseSchema = z.object({
  name: z.string().min(1, 'Name must not be empty'),
  description: z.string().optional(),
  // ... other fields
});

export const MyEntityFormSchema = MyEntityBaseSchema;

export const MyEntitySchema = MyEntityBaseSchema.extend({
  _id: Id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MyEntity = z.infer<typeof MyEntitySchema>;
export type MyEntityForm = z.infer<typeof MyEntityFormSchema>;
```

### 2. Export from Index

Add the export to `src/index.ts`:

```typescript
export * from './my-entity';
```

### 3. Build the Package

```bash
pnpm build:schema
```

## Adding to MongoDB Schema

If your entity needs database persistence, follow these additional steps:

### 1. Update Prisma Schema

Edit the schema file at [`../../apps/worldbuilder/prisma/schema.prisma`](../../apps/worldbuilder/prisma/schema.prisma):

```prisma
model MyEntity {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([name])
}
```

### 2. Generate Prisma Client

```bash
pnpm --filter @talespin/worldbuilder exec prisma generate
```

### 3. Push to Database

```bash
pnpm --filter @talespin/worldbuilder exec prisma db push
```

### 4. Restart Worldbuilder

```bash
pnpm dev
```

MongoDB must have the `rs0` replica set initialized before `prisma db push`. Follow the root local-development guide rather than creating a package-specific database setup.

## Usage Examples

### In Watcher (Validation)

```typescript
import { WorldFormSchema } from '@talespin/schema';

// Validate incoming request
const result = WorldFormSchema.safeParse(req.body);
if (!result.success) {
  return reply.status(400).send({ errors: result.error });
}
```

### In Worldbuilder (Form Rendering)

```typescript
import { WorldFormSchema } from '@talespin/schema';
import { ZodProvider } from '@autoform/zod';

const schemaProvider = new ZodProvider(WorldFormSchema);
return <AutoForm schema={schemaProvider} onSubmit={handleSubmit} />;
```

## Project Structure

```
packages/schema/
├── src/
│   ├── index.ts                    # Public exports
│   ├── common.ts                   # Shared IDs and utilities
│   ├── world.ts                    # Persisted world contracts
│   ├── world-creation.ts           # Generated blueprint contracts
│   ├── region.ts                   # Semantic map territories
│   ├── faction.ts                  # Faction/culture/species contracts
│   ├── character.ts                # Character and gallery contracts
│   ├── treasure-hunt-run.ts        # Persistent loop state
│   └── treasure-hunt-event.ts      # Structured gameplay events
├── package.json
└── vite.config.ts
```

## Dependencies

This package is consumed by:

- `apps/watcher` - Fastify API service
- `apps/worldbuilder` - Next.js frontend application
