import type { ChatCompletionOptions } from './ChatCompletionOptions';
import type { ChatCompletionResponse } from './ChatCompletionResponse';
import type { Conversation } from './Conversation';
import type { EmbeddingOptions } from './EmbeddingOptions';
import type { EmbeddingResponse } from './EmbeddingResponse';
import type { RerankOptions } from './RerankOptions';
import type { RerankResponse } from './RerankResponse';

/** Contract implemented by `LLM` and any test double / alternate transport. */
export interface LLMClient {
  tokenize(text: string): Promise<number[]>;
  chatCompletion(conversation: Conversation, options: ChatCompletionOptions): Promise<ChatCompletionResponse>;
  embeddings(input: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;
  rerank(query: string, documents: string[], options?: RerankOptions): Promise<RerankResponse>;
}
