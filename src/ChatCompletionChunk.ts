import type { ToolCallDelta } from './ToolCallDelta';

/** One incremental piece of a streamed chat completion. */
export class ChatCompletionChunk {
  constructor(
    public index: number,
    public delta: string,
    public reasoningDelta: string | null,
    public toolCallDeltas: ToolCallDelta[] | null,
    public finishReason: string | null,
  ) {}
}
