# llm-lib-ts

TypeScript (ESM) client for **OpenAI-compatible** endpoints: chat, streaming, agent + tools, embeddings, rerank.

Built for [llama.cpp](https://github.com/ggml-org/llama.cpp); also works with OpenAI / OpenRouter.

## Install

```bash
bun add git+https://github.com/tivins/llm-lib-ts.git
# or: clone the repo and import from src/
```

Expected runtime: [Bun](https://bun.sh) (native `.ts` imports).

## Quick start

Local llama.cpp-style server on `:8080`:

```ts
import { ChatCompletionOptions, Conversation, LLM, Message, Role } from "llm-lib-ts";

const llm = new LLM("http://localhost:8080"); // endpoint, apiKey?, defaultModel?, timeoutSeconds=120

const conversation = new Conversation([
  new Message(Role.System, "You're a helpful assistant."),
  new Message(Role.User, "Describe the void in exactly 15 words"),
]);

const response = await llm.chatCompletion(conversation, new ChatCompletionOptions());
console.log(response.assistantMessage()?.content);
```

Fuller example: [`examples/minimal.ts`](examples/minimal.ts). Interactive streamed chat: [`examples/streamExample.ts`](examples/streamExample.ts).

---

## Chat

`LLM` implements `LLMClient`. Every response exposes `usage`, `duration` (ms), and `raw()`.

### Complete

```ts
const options = new ChatCompletionOptions();
options.temperature = 0.2;
options.model = "my-model"; // otherwise LLM.defaultModel

const response = await llm.chatCompletion(conversation, options);
response.assistantMessage()?.content;
response.finishReason(); // "stop" | "tool_calls" | "length" | …
response.usage;          // promptTokens / completionTokens / totalTokens
```

`chatCompletion` does **not** mutate the conversation: you add the assistant message yourself if you continue the thread.

### Stream

Same accumulated response shape, plus a callback per delta:

```ts
const response = await llm.chatCompletionStream(conversation, options, (chunk) => {
  if (chunk.reasoningDelta) process.stdout.write(chunk.reasoningDelta);
  if (chunk.delta) process.stdout.write(chunk.delta);
});
```

`ChatCompletionChunk`: `delta`, `reasoningDelta`, `toolCallDeltas`, `finishReason`.

### Abort

Pass an `AbortSignal`. A **caller** abort during streaming resolves a partial response (`finishReason === "aborted"`); timeouts / network failures still throw.

```ts
const ac = new AbortController();
options.signal = ac.signal;
// ac.abort();
```

In-flight tool calls are **dropped** on abort (arguments JSON may be truncated).

### Options (`ChatCompletionOptions`)

| Field | Default | Notes |
|---|---|---|
| `model` | `LLM.defaultModel` | |
| `temperature` | `0.7` | |
| `topP` | `1.0` | |
| `n` | `1` | |
| `tools` | — | a `ToolRegistry` |
| `toolChoice` | — | e.g. `"auto"` |
| `responseFormat` | — | sent as `{ type }` |
| `signal` | — | abort (stream) |

---

## Agent + tools

`Agent` loops LLM calls and tool execution until a final answer. It **appends** assistant / tool messages to the `Conversation`.

```ts
import {
  Agent, ChatCompletionOptions, Conversation, LLM, Message, Role,
  Tool, ToolRegistry, ToolSchema,
} from "llm-lib-ts";

const tools = new ToolRegistry(
  new Tool(
    new ToolSchema("lookup_order", "Look up an order by reference.", {
      type: "object",
      properties: { order_reference: { type: "string" } },
      required: ["order_reference"],
    }),
    async (argsJson) => {
      const { order_reference } = JSON.parse(argsJson);
      return JSON.stringify({ order_reference, status: "delayed" });
    },
  ),
);

const agent = new Agent(llm, tools); // maxToolRounds=10, optional hooks
const conversation = new Conversation([
  new Message(Role.System, "Call lookup_order before answering."),
  new Message(Role.User, "Check order FR-2026-0042."),
]);

const result = await agent.runTurn(conversation, new ChatCompletionOptions());
// result.success, result.message, result.toolRounds, result.finishReason, result.error
```

Same loop, streamed: `agent.runTurnStream(conversation, options, onChunk)`.

Rules:

- `options.tools` must be **the same** registry as `agent.tools`, or omitted (the agent sets it).
- A tool handler receives `argumentsJson` (`string`) and returns a `string` (sync or async). Handler error → tool message `{ error }`.
- `finish_reason: length` with no tool calls = truncated success (`result.truncated()`).
- Too many tool rounds → `success: false`.

### Hooks

Chained listeners on a turn’s lifecycle:

```ts
import { AgentHooks, userRejectedToolCall } from "llm-lib-ts";

const hooks = new AgentHooks()
  .beforeToolCall((event) => {
    if (event.call.name === "write_file") {
      event.replacement = userRejectedToolCall(event.call); // skip the real handler
    }
  })
  .onAssistantResponse((event) => {
    event.visibleContent = `[bot] ${event.rawContent}`;
  });

const agent = new Agent(llm, tools, 10, hooks);
```

| Hook | Useful for |
|---|---|
| `beforeTurn` / `afterTurn` | logging, metrics |
| `beforeLlmCall` / `afterLlmCall` | inspect each round |
| `beforeToolRound` / `afterToolRound` | tool batches |
| `beforeToolCall` | mock, approval (`event.replacement`) |
| `afterToolCall` | audit |
| `onAssistantResponse` | rewrite stored text (`visibleContent`) |
| `onMaxToolRoundsExceeded` | cap hit |

### Tests without a network

Implement `LLMClient` (see `tests/e2e/support/StubLLM.ts`) and pass it to `Agent`.

---

## Embeddings, rerank, tokenize

```ts
const emb = await llm.embeddings("hello");           // string | string[]
emb.first()?.vector;                                 // number[]
emb.vectors();

const ranked = await llm.rerank("query", ["doc A", "doc B"]);
ranked.rankedDocuments(["doc A", "doc B"]);          // sorted by score

await llm.tokenize("hello world");                   // number[]  — llama.cpp POST /tokenize
await llm.contextSize();                             // n_ctx     — llama.cpp GET /props
```

`EmbeddingOptions`: `model`, `encodingFormat` (`float` / `base64`), `dimensions`.  
`RerankOptions`: `model`, `topN`.

Chat / embeddings / stream = OpenAI-compatible. Rerank = `POST /v1/rerank`. Tokenize and `contextSize` = llama.cpp.

---

## Errors

4xx/5xx (and a `{ error }` body) throw `LLMRequestError`:

```ts
import { LLMRequestError } from "llm-lib-ts";

try {
  await llm.chatCompletion(conversation, options);
} catch (e) {
  if (e instanceof LLMRequestError) {
    e.status; e.code; e.providerMessage; e.providerName; e.metadata;
  }
}
```

llama.cpp + Harmony (GPT-OSS): if the server fails after generation, the client tries to **recover** the text from the error. `<|channel|>` markers are parsed automatically (`content` vs `reasoningContent`). Reasoning is **not** sent back on later turns.

---

## Object model (essentials)

| Class | Role |
|---|---|
| `LLM` / `LLMClient` | HTTP transport |
| `Conversation` | ordered list of `Message` |
| `Message` | `role`, `content`, `reasoningContent`, `toolCalls`, `toolCallId`, `meta` |
| `Role` | `system` · `assistant` · `user` · `tool` |
| `ChatCompletionResponse` | choices, usage, helpers |
| `Agent` / `AgentTurnResult` | tool loop |
| `Tool` + `ToolSchema` + `ToolRegistry` | declaration and execution |
| `Logger` | JSON dump of the conversation on every `addMessage` |

`Conversation` accepts a `Logger`: each added message is written to disk.

```ts
const conversation = new Conversation([], new Logger("./logs/chat.json"));
```

---

## Scripts

```bash
bun test           # unit + e2e (e2e skipped if the server is down)
bun run test:unit
bun run test:e2e   # chat :8080 · embeddings :8081 · rerank :8082
bun run typecheck
```

MIT license — see [`CHANGELOG.md`](CHANGELOG.md).
