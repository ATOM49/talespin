# @talespin/ai

AI utilities package for Talespin, providing LangChain runnables for image generation, editing, and structured output operations.

Provider-neutral contracts are exported for structured output, image
generation, and image editing. The package also includes a Segmind AI Gateway
client with V1 synchronous inference, V2 submit/poll/result inference, bounded
timeouts, request-ID tracking, sanitized provider errors, and model-slug path
validation.

Concrete Segmind image adapters currently cover:

- `nano-banana-pro` for maps;
- `seedream-4.5` for character art;
- `ideogram-4` for faction art.

Each adapter owns its model-specific request mapping. New Segmind text, image,
video, or editing endpoints should use `SegmindModelEndpoint` rather than
placing provider parameters in watcher routes.

## Installation

This is an internal package linked through the Talespin pnpm workspace. Install once from the repository root; do not add or link it separately.

```bash
pnpm install --frozen-lockfile
```

See [Local Development](../../docs/LOCAL_DEVELOPMENT.md) for the complete application and provider setup.

## Building

```bash
# Build the package
pnpm --filter @talespin/ai build
```

## Usage

### OpenAIStructuredOutputRunnable

A LangChain Runnable that generates structured data conforming to a Zod schema using OpenAI's native structured output support.

```typescript
import { OpenAIStructuredOutputRunnable } from '@talespin/ai';
import { z } from 'zod';

const runnable = new OpenAIStructuredOutputRunnable({
  apiKey: process.env.OPENAI_API_KEY, // Optional, defaults to env var
  model: 'gpt-4o-mini', // Optional, defaults to 'gpt-4o-mini'
});

const ProductSchema = z.object({
  name: z.string().describe('Product name'),
  price: z.number().min(0).describe('Price in USD'),
  category: z.enum(['electronics', 'clothing', 'food']),
  inStock: z.boolean(),
});

const result = await runnable.invoke({
  prompt: 'Generate a product for a mechanical keyboard priced at $149',
  schema: ProductSchema,
  temperature: 0.7, // Optional, controls randomness (0-2)
  maxRetries: 2, // Optional, retry attempts on errors
});

console.log(result.structuredResponse);
// { name: "Mechanical Keyboard Pro", price: 149, category: "electronics", inStock: true }

console.log(result.providerMeta);
// { provider: 'openai', model: 'gpt-4o-mini' }
```

#### Using Talespin Schemas

```typescript
import { OpenAIStructuredOutputRunnable } from '@talespin/ai';
import { WorldFormSchema, CharacterFormSchema } from '@talespin/schema';

const runnable = new OpenAIStructuredOutputRunnable();

// Generate a world
const worldResult = await runnable.invoke({
  prompt: 'Create a dark fantasy world with Gothic architecture',
  schema: WorldFormSchema,
});

// Generate a character
const characterResult = await runnable.invoke({
  prompt: 'Create a mysterious rogue with stealth abilities',
  schema: CharacterFormSchema,
});
```

#### Input Types

```typescript
type InArgs<T> = {
  prompt: string; // Natural language prompt describing desired output
  schema: ZodSchema<T>; // Zod schema defining the structure
  temperature?: number; // Randomness (0-2), default 0.7
  maxRetries?: number; // Retry attempts on errors, default 2
};
```

#### Output Types

```typescript
type OutArgs<T> = {
  structuredResponse: T; // Generated data matching schema type
  providerMeta: {
    provider: 'openai';
    model: string; // Model used for generation
    promptTokens?: number; // Tokens in prompt
    completionTokens?: number; // Tokens in completion
    totalTokens?: number; // Total tokens used
  };
};
```

### OpenAIImageEditRunnable

A LangChain Runnable that uses OpenAI's DALL-E 2 model to edit images based on a prompt and mask.

```typescript
import { OpenAIImageEditRunnable } from '@talespin/ai';
import fs from 'fs';

const runnable = new OpenAIImageEditRunnable({
  apiKey: process.env.OPENAI_API_KEY, // Optional, defaults to env var
  model: 'dall-e-2', // Optional, defaults to 'dall-e-2'
});

const imageBuffer = fs.readFileSync('path/to/image.png');
const maskBuffer = fs.readFileSync('path/to/mask.png');

const result = await runnable.invoke({
  prompt: 'A sunlit indoor lounge area with a pool containing a flamingo',
  image: imageBuffer,
  mask: maskBuffer,
  size: '1024x1024', // '256x256' | '512x512' | '1024x1024'
});

// result.editedImageBuffer contains the edited image
fs.writeFileSync('edited-image.png', result.editedImageBuffer);

// result.providerMeta contains metadata about the generation
console.log(result.providerMeta);
// { provider: 'openai', model: 'dall-e-2', size: '1024x1024' }
```

### Input Types

```typescript
type InArgs = {
  prompt: string; // Description of the desired edit
  negativePrompt?: string; // Currently unused, reserved for future use
  image: Buffer; // Original image as Buffer
  mask: Buffer; // Mask defining edit area (transparent = edit, opaque = preserve)
  size: '256x256' | '512x512' | '1024x1024'; // Output image dimensions
};
```

### Output Types

```typescript
type OutArgs = {
  editedImageBuffer: Buffer; // Edited image as Buffer
  providerMeta: {
    provider: 'openai';
    model: string; // Model used for generation
    size: string; // Size of generated image
    requestId?: string; // Optional request ID for tracking
  };
};
```

## API Requirements

- **OpenAI API Key**: Set `OPENAI_API_KEY` environment variable or pass via constructor
- **Segmind API Key**: Set `SEGMIND_API_KEY` server-side or pass it to `SegmindClient`
- **Models**:
  - Structured Output: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo` (supports native structured output)
  - Image Editing: `dall-e-2`
  - Image Generation: `dall-e-3`
- **Image Format**: Supports PNG format with transparency for masks

## Testing

```bash
# Run tests; live OpenAI cases skip without OPENAI_API_KEY
pnpm --filter @talespin/ai test

# Run tests in watch mode
pnpm --filter @talespin/ai test:watch
```

The test suite includes examples using all Talespin schemas:

- World generation with themes and context windows
- Character generation with descriptors and faction relationships
- Faction generation with character hooks and keywords
- Location generation with relative coordinates
- Custom schema validation
- Error handling and retry logic
- Temperature control effects

## Development

```bash
# Run in watch mode
pnpm --filter @talespin/ai dev
```

## Architecture

This package uses:

- **LangChain Core**: Provides the `Runnable` base class for composable operations
- **LangChain OpenAI**: Integration with OpenAI's chat models and structured output
- **OpenAI SDK**: Handles communication with OpenAI's image and chat APIs
- **Zod**: Schema validation for structured outputs
- **Vite**: Bundles the package as an ES module with TypeScript declarations
- **Vitest**: Testing framework for unit and integration tests

## Notes

- Image editing uses OpenAI's `images.edit` endpoint
- Masks should be PNG images with transparency indicating areas to edit
- The `negativePrompt` parameter is reserved for future use when supported by the API
- All responses use base64 encoding for efficient data transfer
