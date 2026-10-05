import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import { z } from 'zod';
import { OpenAIStructuredOutputRunnable } from '@talespin/ai';
import { createStructuredOutputModel } from '../../src/config/models.js';
import { generationContext } from '../../src/services/generation-recovery.js';
import { MemoryStore } from '../memory-generation-store.js';

it('checkpoints only validated model output and invalidates when the output contract changes', async () => {
  process.env.OPENAI_API_KEY = 'fixture-only';
  process.env.AI_TEXT_PROVIDER = 'openai';
  let calls = 0;
  const stub = mock.method(
    OpenAIStructuredOutputRunnable.prototype,
    'invoke',
    async () => {
      calls++;
      return {
        structuredResponse: {
          name: calls === 1 ? '' : 'valid',
          extra: 'new-field',
        },
        providerMeta: { provider: 'openai', model: 'fixture' },
      };
    },
  );
  const store = new MemoryStore();
  const schema = z.object({ name: z.string().min(1) });
  const model = createStructuredOutputModel<{ name: string }>();
  const run = () =>
    generationContext.run({ scope: 'contract-test', store }, () =>
      model.invoke({ prompt: 'unchanged prompt', schema }),
    );
  try {
    await assert.rejects(run);
    assert.equal((await run()).structuredResponse.name, 'valid');
    await run();
    assert.equal(calls, 2);
    await generationContext.run({ scope: 'contract-test', store }, () =>
      model.invoke({
        prompt: 'unchanged prompt',
        schema: schema.extend({ extra: z.string() }),
      }),
    );
    assert.equal(calls, 3);
  } finally {
    stub.mock.restore();
  }
});
