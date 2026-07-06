import { AgentHookEvent } from './AgentHookEvent';
import type {
  AfterLlmCallEvent,
  AfterToolCallEvent,
  AfterToolRoundEvent,
  AfterTurnEvent,
  BeforeLlmCallEvent,
  BeforeToolCallEvent,
  BeforeToolRoundEvent,
  BeforeTurnEvent,
  OnAssistantResponseEvent,
  OnMaxToolRoundsExceededEvent,
} from './hooks';

type Listener<T> = (payload: T) => void;

/** Registry of callable listeners for agent lifecycle hook events. */
export class AgentHooks {
  private listeners = new Map<AgentHookEvent, Listener<any>[]>();

  on<T>(event: AgentHookEvent, listener: Listener<T>): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  beforeTurn(listener: Listener<BeforeTurnEvent>): this {
    return this.on(AgentHookEvent.BeforeTurn, listener);
  }

  afterTurn(listener: Listener<AfterTurnEvent>): this {
    return this.on(AgentHookEvent.AfterTurn, listener);
  }

  beforeLlmCall(listener: Listener<BeforeLlmCallEvent>): this {
    return this.on(AgentHookEvent.BeforeLlmCall, listener);
  }

  afterLlmCall(listener: Listener<AfterLlmCallEvent>): this {
    return this.on(AgentHookEvent.AfterLlmCall, listener);
  }

  beforeToolRound(listener: Listener<BeforeToolRoundEvent>): this {
    return this.on(AgentHookEvent.BeforeToolRound, listener);
  }

  afterToolRound(listener: Listener<AfterToolRoundEvent>): this {
    return this.on(AgentHookEvent.AfterToolRound, listener);
  }

  beforeToolCall(listener: Listener<BeforeToolCallEvent>): this {
    return this.on(AgentHookEvent.BeforeToolCall, listener);
  }

  afterToolCall(listener: Listener<AfterToolCallEvent>): this {
    return this.on(AgentHookEvent.AfterToolCall, listener);
  }

  onMaxToolRoundsExceeded(listener: Listener<OnMaxToolRoundsExceededEvent>): this {
    return this.on(AgentHookEvent.OnMaxToolRoundsExceeded, listener);
  }

  onAssistantResponse(listener: Listener<OnAssistantResponseEvent>): this {
    return this.on(AgentHookEvent.OnAssistantResponse, listener);
  }

  dispatch<T>(event: AgentHookEvent, payload: T): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  has(event: AgentHookEvent): boolean {
    return (this.listeners.get(event) ?? []).length > 0;
  }
}
