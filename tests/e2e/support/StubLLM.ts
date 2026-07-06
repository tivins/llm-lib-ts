import type { ChatCompletionResponse } from '../../../src/ChatCompletionResponse';
import type { EmbeddingResponse } from '../../../src/EmbeddingResponse';
import type { LLMClient } from '../../../src/LLMClient';
import type { RerankResponse } from '../../../src/RerankResponse';

/** Deterministic LLMClient stub that replays enqueued chat completion responses. */
export class StubLLM implements LLMClient {
  private queue: ChatCompletionResponse[] = [];

  enqueue(...responses: ChatCompletionResponse[]): void {
    this.queue.push(...responses);
  }

  async chatCompletion(): Promise<ChatCompletionResponse> {
    const response = this.queue.shift();
    if (!response) {
      throw new Error('StubLLM: no enqueued response left');
    }
    return response;
  }

  async tokenize(): Promise<number[]> {
    throw new Error('StubLLM: tokenize not implemented');
  }

  async embeddings(): Promise<EmbeddingResponse> {
    throw new Error('StubLLM: embeddings not implemented');
  }

  async rerank(): Promise<RerankResponse> {
    throw new Error('StubLLM: rerank not implemented');
  }
}
