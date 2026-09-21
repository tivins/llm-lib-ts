import {
  ChatCompletionOptions,
  Conversation,
  LLM,
  Message,
  Role,
} from "../src";


const llm = new LLM("http://localhost:8080", undefined, undefined, 300);

const conversation = new Conversation([
    new Message(Role.System, "You're a helpful assistant."),
    new Message(Role.User, "Describe the void in exactly 15 words"),
]);

const response = await llm.chatCompletion(conversation, new ChatCompletionOptions());
console.log(response.assistantMessage()?.content);