import type { ChatCompletionOptions } from './ChatCompletionOptions';
import type { ChatCompletionResponse } from './ChatCompletionResponse';
import type { Conversation } from './Conversation';
import type { Message } from './Message';
import type { ToolCall } from './ToolCall';
import type { AgentTurnResult } from './AgentTurnResult';

/** Payload dispatched before an agent turn starts. */
export interface BeforeTurnEvent {
  readonly conversation: Conversation;
  readonly options: ChatCompletionOptions;
}

/** Payload dispatched after an agent turn completes. */
export interface AfterTurnEvent {
  readonly conversation: Conversation;
  readonly options: ChatCompletionOptions;
  readonly result: AgentTurnResult;
}

/** Payload dispatched before each LLM API call within a turn. */
export interface BeforeLlmCallEvent {
  readonly conversation: Conversation;
  readonly options: ChatCompletionOptions;
  readonly toolRound: number;
}

/** Payload dispatched after each LLM API call within a turn. */
export interface AfterLlmCallEvent {
  readonly conversation: Conversation;
  readonly options: ChatCompletionOptions;
  readonly toolRound: number;
  readonly response: ChatCompletionResponse;
}

/** Payload dispatched before the agent executes a round of tool calls. */
export interface BeforeToolRoundEvent {
  readonly conversation: Conversation;
  readonly response: ChatCompletionResponse;
  readonly assistantMessage: Message;
  readonly toolCalls: ToolCall[];
  readonly toolRound: number;
}

/** Payload dispatched after the agent finishes a round of tool calls. */
export interface AfterToolRoundEvent {
  readonly conversation: Conversation;
  readonly toolMessages: Message[];
  readonly toolRound: number;
}

/** Payload dispatched before a single tool call; listeners may set `replacement` to skip the real handler. */
export interface BeforeToolCallEvent {
  readonly call: ToolCall;
  readonly toolRound: number;
  replacement: Message | null;
}

/** Payload dispatched after a single tool call completes. */
export interface AfterToolCallEvent {
  readonly call: ToolCall;
  readonly toolMessage: Message;
  readonly toolRound: number;
}

/** Payload dispatched for the final assistant message; listeners may alter `visibleContent`. */
export interface OnAssistantResponseEvent {
  readonly message: Message;
  readonly rawContent: string;
  visibleContent: string;
}

/** Payload dispatched when the agent exceeds the maximum allowed tool rounds. */
export interface OnMaxToolRoundsExceededEvent {
  readonly conversation: Conversation;
  readonly options: ChatCompletionOptions;
  readonly toolRounds: number;
  readonly maxToolRounds: number;
}
