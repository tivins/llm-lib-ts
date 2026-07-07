import { ChatCompletionChunk } from '../../../src/ChatCompletionChunk';
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

  async chatCompletionStream(
    _conversation: unknown,
    _options: unknown,
    onChunk: (chunk: ChatCompletionChunk) => void,
  ): Promise<ChatCompletionResponse> {
    const response = await this.chatCompletion();
    const message = response.firstChoice()?.message;
    if (message) {
      onChunk(new ChatCompletionChunk(0, message.content, message.reasoningContent, null, response.finishReason() ?? null));
    }
    return response;
  }

  async tokenize(): Promise<number[]> {
    throw new Error('StubLLM: tokenize not implemented');
  }

  async contextSize(): Promise<number> {
    throw new Error('StubLLM: contextSize not implemented');
  }

  async embeddings(): Promise<EmbeddingResponse> {
    throw new Error('StubLLM: embeddings not implemented');
  }

  async rerank(): Promise<RerankResponse> {
    throw new Error('StubLLM: rerank not implemented');
  }
}
