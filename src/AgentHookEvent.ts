/** Names of lifecycle events dispatched by the Agent during a turn. */
export enum AgentHookEvent {
  BeforeTurn = 'beforeTurn',
  AfterTurn = 'afterTurn',

  BeforeLlmCall = 'beforeLlmCall',
  AfterLlmCall = 'afterLlmCall',

  BeforeToolRound = 'beforeToolRound',
  AfterToolRound = 'afterToolRound',

  BeforeToolCall = 'beforeToolCall',
  AfterToolCall = 'afterToolCall',

  OnMaxToolRoundsExceeded = 'onMaxToolRoundsExceeded',

  OnAssistantResponse = 'onAssistantResponse',
}
