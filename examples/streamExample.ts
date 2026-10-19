import {
  ChatCompletionOptions,
  Conversation,
  LLM,
  Message,
} from "../src";


const llm = new LLM("http://localhost:8080", undefined, undefined, 300);

const conversation = new Conversation([
    Message.system("You're a helpful assistant."),
    Message.user("Describe the void in exactly 15 words"),
]);

// Each chunk carries the text generated since the previous one, and the token usage so far.
const response = await llm.chatCompletionStream(conversation, new ChatCompletionOptions(), chunk => {
    process.stdout.write(chunk.delta);
});
process.stdout.write("\n");

const {promptTokens, reasoningTokens, completionTokens} = response.usage;
console.log(`tokens: ${promptTokens} in, ${completionTokens} out (${reasoningTokens ?? 0} reasoning)`);
