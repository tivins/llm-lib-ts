import {
  ChatCompletionOptions,
  Conversation,
  LLM,
  Message,
  ResponseFormat,
} from "../src";


const llm = new LLM("http://localhost:8080", undefined, undefined, 300);

// llama-server compiles the schema into a grammar: the reply matches it by construction.
const format = ResponseFormat.jsonSchema("planet", {
    type: "object",
    properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["rocky", "gas giant", "ice giant", "dwarf"] },
        moons: { type: "integer", minimum: 0 },
        facts: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    },
    required: ["name", "type", "moons", "facts"],
    additionalProperties: false,
});

const conversation = new Conversation([
    Message.system("You're a helpful assistant."),
    Message.user("Describe the planet Saturn."),
]);

const response = await llm.chatCompletion(conversation, new ChatCompletionOptions({ responseFormat: format }));
const planet = JSON.parse(response.assistantMessage()?.content ?? "{}");
console.log(planet);
