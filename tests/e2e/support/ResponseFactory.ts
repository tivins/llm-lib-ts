import { ChatCompletionResponse } from '../../../src/ChatCompletionResponse';
import { Choice } from '../../../src/Choice';
import { Message } from '../../../src/Message';
import { Role } from '../../../src/Role';
import type { ToolCall } from '../../../src/ToolCall';
import { Usage } from '../../../src/Usage';

/** Builds StubLLM-friendly ChatCompletionResponse fixtures without a real HTTP call. */
export const ResponseFactory = {
  assistantText(content: string): ChatCompletionResponse {
    const message = new Message(Role.Assistant, content);
    return new ChatCompletionResponse('stub-model', new Usage(0, 0, 0), [new Choice(0, message, 'stop')]);
  },

  assistantToolCalls(toolCalls: ToolCall[]): ChatCompletionResponse {
    const message = new Message(Role.Assistant, '', null, {}, toolCalls);
    return new ChatCompletionResponse('stub-model', new Usage(0, 0, 0), [new Choice(0, message, 'tool_calls')]);
  },
};
