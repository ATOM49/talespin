import {
  SegmindApiError,
  SegmindInferenceError,
  SegmindTimeoutError,
  sanitizeSegmindErrorBody,
} from './errors.js';

export type SegmindInferenceStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type SegmindAsyncSubmission = {
  request_id: string;
  status: SegmindInferenceStatus;
  poll_url?: string;
  status_url?: string;
  response_url?: string;
};

export type SegmindAsyncStatus = {
  request_id?: string;
  status: SegmindInferenceStatus;
  error?: string | null;
  metrics?: Record<string, unknown>;
};

export type SegmindAsyncResult = {
  status: SegmindInferenceStatus;
  output?: unknown;
  images?: Array<{
    url: string;
    content_type?: string;
    file_size?: string;
  }>;
  error?: string | null;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SegmindV1Response =
  | {
      kind: 'binary';
      body: Buffer;
      contentType: string;
      requestId?: string;
    }
  | {
      kind: 'json';
      body: unknown;
      contentType: string;
      requestId?: string;
    };

export type SegmindAsyncInvocationResult<T extends SegmindAsyncResult> = {
  requestId: string;
  result: T;
};

export type SegmindDownloadedMedia = {
  body: Buffer;
  contentType: string;
};

export type SegmindClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  submitMaxRetries?: number;
};

export type SegmindV1InvocationOptions = {
  responseType?: 'auto' | 'binary' | 'json';
  timeoutMs?: number;
};

export type SegmindV2InvocationOptions = {
  requestId?: string;
  beforeSubmit?: () => Promise<void>;
  onSubmitted?: (requestId: string) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  submitMaxRetries?: number;
};

const DEFAULT_BASE_URL = 'https://api.segmind.com';
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_SUBMIT_MAX_RETRIES = 0;
const MODEL_SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const isJsonContentType = (contentType: string): boolean =>
  contentType.includes('application/json') || contentType.includes('+json');

const getRequestId = (response: Response): string | undefined =>
  response.headers.get('x-request-id') ??
  response.headers.get('request-id') ??
  undefined;

export class SegmindClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly submitMaxRetries: number;

  constructor(options: SegmindClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.SEGMIND_API_KEY;
    if (!apiKey) {
      throw new Error('SEGMIND_API_KEY is not configured');
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.submitMaxRetries =
      options.submitMaxRetries ?? DEFAULT_SUBMIT_MAX_RETRIES;
  }

  async invokeV1(
    model: string,
    input: Record<string, unknown>,
    options: SegmindV1InvocationOptions = {},
  ): Promise<SegmindV1Response> {
    this.assertModelSlug(model);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const response = await this.request(
      `${this.baseUrl}/v1/${model}`,
      {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(input),
      },
      timeoutMs,
    );

    await this.assertResponseOk(response);

    const contentType =
      response.headers.get('content-type') ?? 'application/octet-stream';
    const requestId = getRequestId(response);
    const responseType = options.responseType ?? 'auto';
    const shouldParseJson =
      responseType === 'json' ||
      (responseType === 'auto' && isJsonContentType(contentType));

    if (shouldParseJson) {
      return {
        kind: 'json',
        body: await this.parseJson(response),
        contentType,
        requestId,
      };
    }

    return {
      kind: 'binary',
      body: Buffer.from(await response.arrayBuffer()),
      contentType,
      requestId,
    };
  }

  async downloadMedia(
    mediaUrl: string,
    timeoutMs = this.timeoutMs,
  ): Promise<SegmindDownloadedMedia> {
    const url = new URL(mediaUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'images.segmind.com') {
      throw new Error(`Untrusted Segmind media URL: ${url.hostname}`);
    }

    const response = await this.request(url.toString(), {}, timeoutMs);
    await this.assertResponseOk(response);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType:
        response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async submitV2(
    model: string,
    input: Record<string, unknown>,
    options: Pick<
      SegmindV2InvocationOptions,
      'timeoutMs' | 'submitMaxRetries'
    > = {},
  ): Promise<SegmindAsyncSubmission> {
    this.assertModelSlug(model);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const maxRetries = options.submitMaxRetries ?? this.submitMaxRetries;

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.request(
        `${this.baseUrl}/v2/${model}`,
        {
          method: 'POST',
          headers: this.jsonHeaders(),
          body: JSON.stringify(input),
        },
        timeoutMs,
      );

      if (response.ok) {
        const submission =
          await this.parseJson<SegmindAsyncSubmission>(response);
        this.assertRequestId(submission.request_id);
        return submission;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await response.arrayBuffer();
        await sleep(Math.min(1_000 * (attempt + 1), 5_000));
        continue;
      }

      await this.assertResponseOk(response);
    }
  }

  async getV2Status(
    requestId: string,
    timeoutMs = this.timeoutMs,
  ): Promise<SegmindAsyncStatus> {
    this.assertRequestId(requestId);
    const response = await this.request(
      `${this.baseUrl}/v2/requests/${requestId}/status`,
      { headers: this.authHeaders() },
      timeoutMs,
    );

    if (response.status === 422) {
      const failed = await this.parseJson<SegmindAsyncStatus>(response);
      throw new SegmindInferenceError(
        requestId,
        failed.error ?? 'Segmind inference failed',
      );
    }

    await this.assertResponseOk(response);
    return this.parseJson<SegmindAsyncStatus>(response);
  }

  async getV2Result<T extends SegmindAsyncResult = SegmindAsyncResult>(
    requestId: string,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    this.assertRequestId(requestId);
    const response = await this.request(
      `${this.baseUrl}/v2/requests/${requestId}`,
      { headers: this.authHeaders() },
      timeoutMs,
    );

    if (response.status === 422) {
      const failed = await this.parseJson<SegmindAsyncResult>(response);
      throw new SegmindInferenceError(
        requestId,
        typeof failed.error === 'string'
          ? failed.error
          : 'Segmind inference failed',
      );
    }

    await this.assertResponseOk(response);
    return this.parseJson<T>(response);
  }

  async invokeV2<T extends SegmindAsyncResult = SegmindAsyncResult>(
    model: string,
    input: Record<string, unknown>,
    options: SegmindV2InvocationOptions = {},
  ): Promise<SegmindAsyncInvocationResult<T>> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const deadline = Date.now() + timeoutMs;
    let requestId = options.requestId;
    if (requestId) {
      this.assertRequestId(requestId);
    } else {
      await options.beforeSubmit?.();
      const submission = await this.submitV2(model, input, {
        timeoutMs: this.remainingTime(deadline, timeoutMs),
        submitMaxRetries: options.submitMaxRetries ?? 0,
      });
      requestId = submission.request_id;
      // Persist before polling so a process restart can resume this job.
      await options.onSubmitted?.(requestId);
    }
    const pollIntervalMs = options.pollIntervalMs ?? this.pollIntervalMs;

    while (true) {
      const remainingMs = this.remainingTime(deadline, timeoutMs, requestId);
      const status = await this.getV2Status(requestId, remainingMs);

      if (status.status === 'FAILED') {
        throw new SegmindInferenceError(
          requestId,
          status.error ?? 'Segmind inference failed',
        );
      }

      if (status.status === 'COMPLETED') {
        const result = await this.getV2Result<T>(
          requestId,
          this.remainingTime(deadline, timeoutMs, requestId),
        );
        if (result.status === 'FAILED')
          throw new SegmindInferenceError(
            requestId,
            result.error ?? 'Segmind inference failed',
          );
        return { requestId, result };
      }

      await sleep(
        Math.min(
          pollIntervalMs,
          this.remainingTime(deadline, timeoutMs, requestId),
        ),
      );
    }
  }

  private authHeaders(): Record<string, string> {
    return { 'x-api-key': this.apiKey };
  }

  private jsonHeaders(): Record<string, string> {
    return {
      ...this.authHeaders(),
      'Content-Type': 'application/json',
    };
  }

  private async request(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new SegmindTimeoutError(timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertResponseOk(response: Response): Promise<void> {
    if (response.ok) return;

    const body = sanitizeSegmindErrorBody(await response.text());
    const reason =
      response.status === 429
        ? 'rate limit exceeded'
        : response.status === 401
          ? 'authentication failed'
          : response.status === 403
            ? 'model access forbidden'
            : response.status === 406
              ? 'request parameters, content type, credits, or spend limit rejected'
              : undefined;
    throw new SegmindApiError(
      `Segmind API request failed with status ${response.status}${reason ? ` (${reason})` : ''}`,
      response.status,
      body,
    );
  }

  private async parseJson<T = unknown>(response: Response): Promise<T> {
    const body = await response.text();
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new SegmindApiError(
        'Segmind API returned an invalid JSON response',
        response.status,
        body,
      );
    }
  }

  private remainingTime(
    deadline: number,
    timeoutMs: number,
    requestId?: string,
  ): number {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new SegmindTimeoutError(timeoutMs, requestId);
    }
    return remainingMs;
  }

  private assertModelSlug(model: string): void {
    if (!MODEL_SLUG_PATTERN.test(model)) {
      throw new Error(`Invalid Segmind model slug: ${model}`);
    }
  }

  private assertRequestId(requestId: string): void {
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new Error('Segmind returned an invalid request ID');
    }
  }
}
