import type { ToolCallDelta } from './ToolCallDelta';
import type { Usage } from './Usage';

/** One incremental piece of a streamed chat completion. */
export class ChatCompletionChunk {
  constructor(
    public index: number,
    public delta: string,
    public reasoningDelta: string | null,
    public toolCallDeltas: ToolCallDelta[] | null,
    public finishReason: string | null,
    /**
     * Token usage so far (llama.cpp per-chunk `timings`), or the server's final usage on the
     * last chunk of the stream; `null` when the server reports neither.
     */
    public usage: Usage | null = null,
  ) {}
}
