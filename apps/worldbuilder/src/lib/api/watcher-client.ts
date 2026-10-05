import { createHash } from 'node:crypto';
import {
  GenerationIdSchema,
  WatcherContracts,
  type WatcherEndpoint,
  type WatcherInput,
  type WatcherOutput,
} from '@talespin/schema';

export class WatcherError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WatcherError';
  }
}
export interface WatcherClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
/** Server-side only. Retry policy belongs to durable application jobs. */
export class WatcherClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  constructor(private readonly options: WatcherClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.WATCHER_API_URL ??
      'http://localhost:4000'
    ).replace(/\/+$/, '');
    const configured = Number(process.env.WATCHER_GENERATION_TIMEOUT_MS);
    this.timeoutMs =
      options.timeoutMs ??
      (Number.isFinite(configured) && configured > 0 ? configured : 180000);
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }
  async request<E extends WatcherEndpoint>(
    endpoint: E,
    input: WatcherInput<E>,
    options: { generationId?: string } = {},
  ): Promise<WatcherOutput<E>> {
    const contract = WatcherContracts[endpoint];
    const body = JSON.stringify(contract.request.parse(input));
    const generationId = GenerationIdSchema.parse(
      options.generationId ??
        createHash('sha256').update(endpoint).update(body).digest('hex'),
    );
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Generation-Id': generationId,
    };
    const apiKey = this.options.apiKey ?? process.env.WATCHER_API_KEY;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text();
        const step = /Recovery step: ([a-f0-9]{64})/.exec(details)?.[1];
        throw new WatcherError(
          `Watcher request failed (${response.status})${step ? `. Recovery step: ${step}` : ''}`,
          response.status,
        );
      }
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new WatcherError('Watcher returned invalid JSON', 502);
      }
      const parsed = contract.response.safeParse(raw);
      if (!parsed.success)
        throw new WatcherError('Watcher response failed validation', 502);
      return parsed.data as WatcherOutput<E>;
    } catch (error) {
      if (controller.signal.aborted)
        throw new WatcherError('Watcher request timed out', 504);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
