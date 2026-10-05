import { describe, it, expect } from 'vitest';
import { OpenAIStructuredOutputRunnable } from '../src/runnables/structuredOutputRunnable';
import {
  WorldFormSchema,
  CharacterFormSchema,
  FactionFormSchema,
  LocationFormSchema,
  type WorldForm,
  type CharacterForm,
  type FactionForm,
  type LocationForm,
} from '@talespin/schema';
import { z } from 'zod';

describe('OpenAIStructuredOutputRunnable', () => {
  // Skip tests if no API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  const describeIf = apiKey ? describe : describe.skip;

  describeIf('World Generation', () => {
    it('should generate a valid world from a prompt', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<WorldForm>({
        model: 'gpt-4o-mini',
      });

      const result = await runnable.invoke({
        prompt:
          'Create a fantasy world called "Eldoria" with a medieval theme. It should have a rich history of magic and dragons.',
        schema: WorldFormSchema,
        temperature: 0.8,
      });

      expect(result.structuredResponse).toBeDefined();
      expect(result.structuredResponse.name).toBe('Eldoria');
      expect(result.structuredResponse.theme).toBe('fantasy');
      expect(result.structuredResponse.description).toBeDefined();
      expect(result.providerMeta.provider).toBe('openai');
      expect(result.providerMeta.model).toBe('gpt-4o-mini');
    }, 30000);

    it('should respect context window limits', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<WorldForm>();

      const result = await runnable.invoke({
        prompt: 'Create a sci-fi world with a 1024 token context window limit',
        schema: WorldFormSchema,
      });

      expect(result.structuredResponse.contextWindowLimit).toBeDefined();
      expect(
        result.structuredResponse.contextWindowLimit,
      ).toBeGreaterThanOrEqual(256);
      expect(result.structuredResponse.contextWindowLimit).toBeLessThanOrEqual(
        4096,
      );
    }, 30000);
  });

  describeIf('Character Generation', () => {
    it('should generate a character with descriptors', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<CharacterForm>();

      const result = await runnable.invoke({
        prompt:
          'Create a wise wizard character named "Gandalf the Grey" with at least 2 descriptors about his personality and magic abilities.',
        schema: CharacterFormSchema,
        temperature: 0.9,
      });

      expect(result.structuredResponse).toBeDefined();
      expect(result.structuredResponse.name).toContain('Gandalf');
      expect(result.structuredResponse.meta?.descriptors).toBeDefined();
      expect(
        result.structuredResponse.meta?.descriptors?.length,
      ).toBeGreaterThanOrEqual(2);

      // Validate descriptor structure
      const descriptor = result.structuredResponse.meta?.descriptors?.[0];
      if (descriptor) {
        expect(descriptor.label).toBeDefined();
        expect(descriptor.detail).toBeDefined();
      }
    }, 30000);

    it('should generate character with faction relationships', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<CharacterForm>();

      const result = await runnable.invoke({
        prompt:
          'Create a rogue character who is a member of the Thieves Guild faction (use ID "faction_001")',
        schema: CharacterFormSchema,
      });

      expect(result.structuredResponse.factionIds).toBeDefined();
      expect(result.structuredResponse.factionIds).toContain('faction_001');
    }, 30000);
  });

  describeIf('Faction Generation', () => {
    it('should generate a faction with character hooks', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<FactionForm>();

      const result = await runnable.invoke({
        prompt:
          'Create a mysterious cult faction called "The Order of the Crimson Moon" with 3 character hooks for potential NPCs.',
        schema: FactionFormSchema,
        temperature: 0.8,
      });

      expect(result.structuredResponse).toBeDefined();
      expect(result.structuredResponse.name).toContain('Crimson Moon');
      expect(result.structuredResponse.category).toBeDefined();
      expect(result.structuredResponse.meta?.characterHooks).toBeDefined();
      expect(
        result.structuredResponse.meta?.characterHooks?.length,
      ).toBeGreaterThanOrEqual(3);

      // Validate character hook structure
      const hook = result.structuredResponse.meta?.characterHooks?.[0];
      if (hook) {
        expect(hook.title).toBeDefined();
        expect(hook.description).toBeDefined();
      }
    }, 30000);

    it('should generate faction with keywords', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<FactionForm>();

      const result = await runnable.invoke({
        prompt:
          'Create a noble knights faction with keywords describing their values and aesthetics',
        schema: FactionFormSchema,
      });

      expect(result.structuredResponse.meta?.keywords).toBeDefined();
      expect(result.structuredResponse.meta?.keywords?.length).toBeGreaterThan(
        0,
      );
    }, 30000);
  });

  describeIf('Location Generation', () => {
    it('should generate a location with coordinates', async () => {
      const runnable = new OpenAIStructuredOutputRunnable<LocationForm>();

      const result = await runnable.invoke({
        prompt:
          'Create a mystical tower location with relative coordinates near the center of the map (u: 0.5, v: 0.5)',
        schema: LocationFormSchema,
      });

      expect(result.structuredResponse).toBeDefined();
      expect(result.structuredResponse.name).toBeDefined();
      expect(result.structuredResponse.coordRel).toBeDefined();
      expect(result.structuredResponse.coordRel.u).toBeGreaterThanOrEqual(0);
      expect(result.structuredResponse.coordRel.u).toBeLessThanOrEqual(1);
      expect(result.structuredResponse.coordRel.v).toBeGreaterThanOrEqual(0);
      expect(result.structuredResponse.coordRel.v).toBeLessThanOrEqual(1);
    }, 30000);
  });

  describeIf('Custom Schema', () => {
    it('should work with a simple custom schema', async () => {
      const SimpleProductSchema = z.object({
        name: z.string().describe('Product name'),
        price: z.number().min(0).describe('Price in USD'),
        category: z.enum(['electronics', 'clothing', 'food']),
        inStock: z.boolean(),
        tags: z.array(z.string()).optional(),
      });
      type SimpleProduct = z.infer<typeof SimpleProductSchema>;

      const runnable = new OpenAIStructuredOutputRunnable<SimpleProduct>();

      const result = await runnable.invoke({
        prompt: 'Generate a product for a mechanical keyboard priced at $149',
        schema: SimpleProductSchema,
      });

      expect(result.structuredResponse).toBeDefined();
      expect(result.structuredResponse.name).toBeDefined();
      expect(result.structuredResponse.price).toBeCloseTo(149, -1);
      expect(result.structuredResponse.category).toBe('electronics');
      expect(typeof result.structuredResponse.inStock).toBe('boolean');
    }, 30000);
  });

  describeIf('Error Handling', () => {
    it('should retry on validation errors', async () => {
      const StrictRatingSchema = z.object({
        rating: z.number().min(1).max(5).describe('Rating from 1 to 5 only'),
        comment: z.string().min(10).describe('At least 10 character comment'),
      });
      type StrictRating = z.infer<typeof StrictRatingSchema>;

      const runnable = new OpenAIStructuredOutputRunnable<StrictRating>({
        model: 'gpt-4o-mini',
      });

      const result = await runnable.invoke({
        prompt: 'Rate this product: Amazing! 11/10',
        schema: StrictRatingSchema,
        maxRetries: 3,
      });

      // Should respect the 1-5 constraint despite the prompt suggesting 11
      expect(result.structuredResponse.rating).toBeGreaterThanOrEqual(1);
      expect(result.structuredResponse.rating).toBeLessThanOrEqual(5);
      expect(result.structuredResponse.comment.length).toBeGreaterThanOrEqual(
        10,
      );
    }, 30000);
  });

  describeIf('Temperature Control', () => {
    it('should produce different results with different temperatures', async () => {
      const SimpleSchema = z.object({
        name: z.string(),
        description: z.string(),
      });
      type SimpleTavern = z.infer<typeof SimpleSchema>;

      const runnable = new OpenAIStructuredOutputRunnable<SimpleTavern>();
      const basePrompt = 'Generate a fantasy tavern name and description';

      const lowTempResult = await runnable.invoke({
        prompt: basePrompt,
        schema: SimpleSchema,
        temperature: 0.1,
      });

      const highTempResult = await runnable.invoke({
        prompt: basePrompt,
        schema: SimpleSchema,
        temperature: 1.5,
      });

      // Both should be valid
      expect(lowTempResult.structuredResponse.name).toBeDefined();
      expect(highTempResult.structuredResponse.name).toBeDefined();

      // They should likely be different (not a strict requirement)
      console.log('Low temp:', lowTempResult.structuredResponse);
      console.log('High temp:', highTempResult.structuredResponse);
    }, 30000);
  });
});
