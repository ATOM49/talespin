import { describe, expect, it, vi } from 'vitest';
import {
  SegmindClient,
  createIdeogramImageModel,
  createNanoBananaProImageModel,
  createSeedreamImageModel,
} from '../src/index.js';

const createClient = (fetchMock: typeof fetch) =>
  new SegmindClient({ apiKey: 'SG_test_key', fetch: fetchMock });

const readRequestBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
    string,
    unknown
  >;

describe('Segmind image model adapters', () => {
  it('maps map generation to Nano Banana Pro at the 2K price tier', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([1]), {
        headers: { 'content-type': 'image/png' },
      }),
    );
    const model = createNanoBananaProImageModel({
      client: createClient(fetchMock),
    });

    const result = await model.invoke({
      prompt: 'A top-down fantasy map',
      size: '1024x1024',
    });

    expect(readRequestBody(fetchMock)).toEqual({
      prompt: 'A top-down fantasy map',
      aspect_ratio: '1:1',
      output_resolution: '2K',
      output_format: 'png',
      response_modalities: 'IMAGE',
      web_search: false,
    });
    expect(result.providerMeta).toMatchObject({
      provider: 'segmind',
      model: 'nano-banana-pro',
    });
  });

  it('maps portrait character art to Seedream 4.5', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([2]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const model = createSeedreamImageModel({
      client: createClient(fetchMock),
    });

    await model.invoke({
      prompt: 'A full-body character portrait',
      size: '1024x1792',
    });

    expect(readRequestBody(fetchMock)).toEqual({
      prompt: 'A full-body character portrait',
      size: '2K',
      aspect_ratio: '9:16',
      max_images: 1,
      sequential_image_generation: 'disabled',
    });
  });

  it('maps faction art to balanced Ideogram 4 generation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [
              { url: 'https://images.segmind.com/generations/faction.png' },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([3]), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    const model = createIdeogramImageModel({
      client: createClient(fetchMock),
    });

    await model.invoke({
      prompt: 'A heraldic faction illustration',
      size: '1024x1024',
    });

    expect(readRequestBody(fetchMock)).toEqual({
      prompt: 'A heraldic faction illustration',
      rendering_speed: 'BALANCED',
      image_size: 'square_hd',
      num_images: 1,
      enable_prompt_expansion: true,
      output_format: 'png',
      enable_safety_checker: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://images.segmind.com/generations/faction.png',
      expect.objectContaining({}),
    );
  });
});

it('uses a saved async generation ID through image download without another POST', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: 'COMPLETED' }))
    .mockResolvedValueOnce(
      Response.json({
        status: 'COMPLETED',
        images: [{ url: 'https://images.segmind.com/recovered.png' }],
      }),
    )
    .mockResolvedValueOnce(
      new Response(Uint8Array.from([9]), {
        headers: { 'content-type': 'image/png' },
      }),
    );
  const model = createSeedreamImageModel({
    client: createClient(fetchMock),
    version: 'v2',
  });
  const result = await model.invoke({
    prompt: 'Recovered portrait',
    size: '1024x1792',
    recovery: {
      requestId: 'saved-id',
      beforeSubmit: async () => {
        throw new Error('Must not submit');
      },
      onSubmitted: async () => {
        throw new Error('Must not replace ID');
      },
    },
  });
  expect(result.providerMeta.requestId).toBe('saved-id');
  expect(result.imageBuffer).toEqual(Buffer.from([9]));
  expect(
    fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST'),
  ).toBe(true);
});
