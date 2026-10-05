import { describe, expect, it, vi } from 'vitest';
import {
  SegmindApiError,
  SegmindClient,
  SegmindInferenceError,
} from '../src/index.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('SegmindClient', () => {
  it('invokes a V1 binary endpoint with server-side API-key auth', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        headers: {
          'content-type': 'image/jpeg',
          'x-request-id': 'req-v1',
        },
      }),
    );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
    });

    const result = await client.invokeV1(
      'image-model',
      { prompt: 'A map' },
      { responseType: 'binary' },
    );

    expect(result).toMatchObject({
      kind: 'binary',
      contentType: 'image/jpeg',
      requestId: 'req-v1',
    });
    if (result.kind === 'binary') {
      expect([...result.body]).toEqual([1, 2, 3]);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.segmind.com/v1/image-model',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-api-key': 'SG_test_key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('submits a V2 request once and polls by request ID', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ request_id: 'req-v2', status: 'QUEUED' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ request_id: 'req-v2', status: 'PROCESSING' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ request_id: 'req-v2', status: 'COMPLETED' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'COMPLETED', output: 'Generated text' }),
      );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
      pollIntervalMs: 0,
    });

    const result = await client.invokeV2('text-model', { prompt: 'Hello' });

    expect(result).toEqual({
      requestId: 'req-v2',
      result: { status: 'COMPLETED', output: 'Generated text' },
    });
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/v2/text-model'),
      ),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.segmind.com/v2/requests/req-v2/status',
      expect.any(Object),
    );
  });

  it('retries only an explicit V2 submit server error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary' }, 500))
      .mockResolvedValueOnce(
        jsonResponse({ request_id: 'req-retry', status: 'QUEUED' }),
      );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
      submitMaxRetries: 1,
    });

    const result = await client.submitV2('text-model', { prompt: 'Hello' });

    expect(result.request_id).toBe('req-retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failed V2 inference without resubmitting it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ request_id: 'req-failed', status: 'QUEUED' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'FAILED', error: 'Prompt is mandatory' }, 422),
      );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
      pollIntervalMs: 0,
    });

    await expect(client.invokeV2('text-model', { prompt: '' })).rejects.toEqual(
      expect.objectContaining<Partial<SegmindInferenceError>>({
        name: 'SegmindInferenceError',
        requestId: 'req-failed',
        message: 'Prompt is mandatory',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('redacts API-key-shaped values from upstream error bodies', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('Invalid key SG_secret_value', { status: 401 }),
      );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
    });

    const error = await client
      .invokeV1('image-model', { prompt: 'A map' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SegmindApiError);
    expect((error as SegmindApiError).responseBody).toBe(
      'Invalid key [redacted]',
    );
  });

  it('rejects model slugs that could escape the endpoint path', async () => {
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(client.invokeV1('../requests', {})).rejects.toThrow(
      'Invalid Segmind model slug',
    );
  });

  it('downloads only media hosted on Segmind output storage', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([9]), {
        headers: { 'content-type': 'image/png' },
      }),
    );
    const client = new SegmindClient({
      apiKey: 'SG_test_key',
      fetch: fetchMock,
    });

    const media = await client.downloadMedia(
      'https://images.segmind.com/generations/result.png',
    );

    expect([...media.body]).toEqual([9]);
    expect(media.contentType).toBe('image/png');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeUndefined();
    await expect(
      client.downloadMedia('https://example.com/result.png'),
    ).rejects.toThrow('Untrusted Segmind media URL');
  });
});

it('resumes an existing async request without a new submission', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: 'COMPLETED' }))
    .mockResolvedValueOnce(
      Response.json({
        status: 'COMPLETED',
        output: 'https://images.segmind.com/existing.png',
      }),
    );
  const client = new SegmindClient({ apiKey: 'test', fetch: fetchMock });
  const result = await client.invokeV2(
    'seedream-4.5',
    {},
    { requestId: 'existing-id' },
  );
  expect(result.requestId).toBe('existing-id');
  expect(
    fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST'),
  ).toBe(true);
});

it('persists an async request ID before polling or downloading', async () => {
  const events: string[] = [];
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        events.push('submit');
        return Response.json({ request_id: 'persist-me', status: 'QUEUED' });
      }
      events.push('poll');
      return Response.json({ status: 'COMPLETED' });
    });
  const client = new SegmindClient({ apiKey: 'test', fetch: fetchMock });
  await client.invokeV2(
    'seedream-4.5',
    {},
    {
      beforeSubmit: async () => {
        events.push('mark-submitting');
      },
      onSubmitted: async () => {
        events.push('persist-id');
      },
    },
  );
  expect(events.slice(0, 4)).toEqual([
    'mark-submitting',
    'submit',
    'persist-id',
    'poll',
  ]);
});
