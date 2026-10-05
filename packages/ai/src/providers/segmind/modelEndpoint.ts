import { Runnable } from '@langchain/core/runnables';
import {
  SegmindClient,
  type SegmindAsyncResult,
  type SegmindV1Response,
  type SegmindV2InvocationOptions,
} from './client.js';

export type SegmindModelResponse =
  | {
      version: 'v1';
      requestId?: string;
      response: SegmindV1Response;
    }
  | {
      version: 'v2';
      requestId: string;
      response: SegmindAsyncResult;
    };

export type SegmindModelEndpointOptions<Input, Output> = {
  client: SegmindClient;
  model: string;
  version: 'v1' | 'v2';
  buildRequest(input: Input): Record<string, unknown>;
  parseResponse(
    response: SegmindModelResponse,
    input: Input,
  ): Output | Promise<Output>;
  v1ResponseType?: 'auto' | 'binary' | 'json';
  v2?: SegmindV2InvocationOptions;
  recovery?: (input: Input) => SegmindV2InvocationOptions;
};

export class SegmindModelEndpoint<Input, Output> extends Runnable<
  Input,
  Output
> {
  lc_namespace = ['talespin', 'ai', 'segmind'];

  private readonly options: SegmindModelEndpointOptions<Input, Output>;

  constructor(options: SegmindModelEndpointOptions<Input, Output>) {
    super();
    this.options = options;
  }

  async invoke(input: Input): Promise<Output> {
    const payload = this.options.buildRequest(input);

    if (this.options.version === 'v1') {
      const response = await this.options.client.invokeV1(
        this.options.model,
        payload,
        { responseType: this.options.v1ResponseType },
      );
      return this.options.parseResponse(
        {
          version: 'v1',
          requestId: response.requestId,
          response,
        },
        input,
      );
    }

    const { requestId, result } = await this.options.client.invokeV2(
      this.options.model,
      payload,
      { ...this.options.v2, ...this.options.recovery?.(input) },
    );
    return this.options.parseResponse(
      { version: 'v2', requestId, response: result },
      input,
    );
  }
}
