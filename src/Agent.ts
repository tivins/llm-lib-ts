import { AgentHooks } from './AgentHooks';
import { AgentHookEvent } from './AgentHookEvent';
import { AgentTurnResult } from './AgentTurnResult';
import type { ChatCompletionChunk } from './ChatCompletionChunk';
import type { ChatCompletionOptions } from './ChatCompletionOptions';
import type { ChatCompletionResponse } from './ChatCompletionResponse';
import type { Conversation } from './Conversation';
import type { AfterToolCallEvent, BeforeToolCallEvent, OnAssistantResponseEvent } from './hooks';
import type { LLMClient } from './LLMClient';
import { Message } from './Message';
import type { ToolCall } from './ToolCall';
import type { ToolRegistry } from './ToolRegistry';

/** Runs a single agent turn: LLM calls, tool execution loops, and lifecycle hooks. */
export class Agent {
  constructor(
    public llm: LLMClient,
    public tools: ToolRegistry,
    public maxToolRounds: number = 10,
    public hooks: AgentHooks = new AgentHooks(),
  ) {}

  async runTurn(conversation: Conversation, options: ChatCompletionOptions): Promise<AgentTurnResult> {
    return this.executeTurn(conversation, options);
  }

  /** Same as `runTurn`, streaming each LLM call through `onChunk`. */
  async runTurnStream(
    conversation: Conversation,
    options: ChatCompletionOptions,
    onChunk: (chunk: ChatCompletionChunk) => void,
  ): Promise<AgentTurnResult> {
    return this.executeTurn(conversation, options, onChunk);
  }

  private async executeTurn(
    conversation: Conversation,
    options: ChatCompletionOptions,
    onChunk?: (chunk: ChatCompletionChunk) => void,
  ): Promise<AgentTurnResult> {
    if (options.tools !== undefined && options.tools !== this.tools) {
      throw new Error('ChatCompletionOptions.tools must be the same registry as Agent.tools, or omitted.');
    }
    const turnOptions = options.clone();
    turnOptions.tools = this.tools;

    this.hooks.dispatch(AgentHookEvent.BeforeTurn, { conversation, options: turnOptions });

    const result = await this.runTurnInner(conversation, turnOptions, onChunk);

    this.hooks.dispatch(AgentHookEvent.AfterTurn, { conversation, options: turnOptions, result });

    return result;
  }

  private async runTurnInner(
    conversation: Conversation,
    options: ChatCompletionOptions,
    onChunk?: (chunk: ChatCompletionChunk) => void,
  ): Promise<AgentTurnResult> {
    let response = await this.callLlm(conversation, options, 0, onChunk);
    let toolRounds = 0;

    while (response.hasToolCalls()) {
      if (toolRounds >= this.maxToolRounds) {
        this.hooks.dispatch(AgentHookEvent.OnMaxToolRoundsExceeded, {
          conversation,
          options,
          toolRounds,
          maxToolRounds: this.maxToolRounds,
        });

        return new AgentTurnResult(
          null,
          false,
          `Max tool rounds (${this.maxToolRounds}) exceeded.`,
          toolRounds,
          response.finishReason() ?? null,
        );
      }

      const assistant = response.assistantMessage();
      if (!assistant) {
        return new AgentTurnResult(
          null,
          false,
          'Assistant message missing despite tool_calls.',
          toolRounds,
          response.finishReason() ?? null,
        );
      }

      const toolCalls = assistant.toolCalls ?? [];

      this.hooks.dispatch(AgentHookEvent.BeforeToolRound, {
        conversation,
        response,
        assistantMessage: assistant,
        toolCalls,
        toolRound: toolRounds,
      });

      conversation.addMessage(this.toStoredAssistantMessage(response, options) ?? assistant);

      const toolMessages: Message[] = [];
      for (const call of toolCalls) {
        const toolMessage = await this.executeToolCall(call, toolRounds);
        conversation.addMessage(toolMessage);
        toolMessages.push(toolMessage);
      }

      this.hooks.dispatch(AgentHookEvent.AfterToolRound, { conversation, toolMessages, toolRound: toolRounds });

      toolRounds++;
      response = await this.callLlm(conversation, options, toolRounds, onChunk);
    }

    const finishReason = response.finishReason();
    if (
      finishReason === 'stop' ||
      finishReason === 'aborted' ||
      (finishReason === 'length' && !response.hasToolCalls())
    ) {
      let stored = this.toStoredAssistantMessage(response, options);
      if (stored) {
        stored = this.applyAssistantResponseHooks(stored);
        conversation.addMessage(stored);

        return new AgentTurnResult(stored, true, null, toolRounds, finishReason);
      }

      return new AgentTurnResult(
        null,
        false,
        'Assistant response could not be stored.',
        toolRounds,
        finishReason ?? null,
      );
    }

    const reason = finishReason ?? 'unknown';

    return new AgentTurnResult(null, false, `Unexpected finish reason: ${reason}.`, toolRounds, finishReason ?? null);
  }

  private async callLlm(
    conversation: Conversation,
    options: ChatCompletionOptions,
    toolRound: number,
    onChunk?: (chunk: ChatCompletionChunk) => void,
  ): Promise<ChatCompletionResponse> {
    this.hooks.dispatch(AgentHookEvent.BeforeLlmCall, { conversation, options, toolRound });

    const response = onChunk
      ? await this.llm.chatCompletionStream(conversation, options, onChunk)
      : await this.llm.chatCompletion(conversation, options);

    this.hooks.dispatch(AgentHookEvent.AfterLlmCall, { conversation, options, toolRound, response });

    return response;
  }

  private toStoredAssistantMessage(response: ChatCompletionResponse, options: ChatCompletionOptions): Message | null {
    const stored = response.toStoredMessage();
    if (!stored) {
      return null;
    }

    return new Message(
      stored.role,
      stored.content,
      stored.reasoningContent,
      { ...stored.meta, temperature: options.temperature },
      stored.toolCalls,
    );
  }

  private applyAssistantResponseHooks(stored: Message): Message {
    const event: OnAssistantResponseEvent = {
      message: stored,
      rawContent: stored.content,
      visibleContent: stored.content,
    };
    this.hooks.dispatch(AgentHookEvent.OnAssistantResponse, event);
    if (event.visibleContent === stored.content) {
      return stored;
    }

    return new Message(
      stored.role,
      event.visibleContent,
      stored.reasoningContent,
      stored.meta,
      stored.toolCalls,
      stored.toolCallId,
    );
  }

  private async executeToolCall(call: ToolCall, toolRound: number): Promise<Message> {
    const event: BeforeToolCallEvent = { call, toolRound, replacement: null };
    this.hooks.dispatch(AgentHookEvent.BeforeToolCall, event);

    const toolMessage = event.replacement ?? (await this.tools.execute(call));

    this.hooks.dispatch(AgentHookEvent.AfterToolCall, { call, toolMessage, toolRound } satisfies AfterToolCallEvent);

    return toolMessage;
  }
}
