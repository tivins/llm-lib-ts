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

const response = await llm.chatCompletion(conversation, new ChatCompletionOptions());
console.log(response.assistantMessage()?.content);