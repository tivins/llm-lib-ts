// Usage: bun examples/multimodalExample.ts <image-or-video> [more files…] [-- "question"]
import {
  Attachment,
  ChatCompletionOptions,
  Conversation,
  LLM,
  Message,
  Role,
} from "../src";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const paths = separator === -1 ? args : args.slice(0, separator);
const question = separator === -1 ? "Describe what you see." : args.slice(separator + 1).join(" ");

if (paths.length === 0) {
  console.error('Usage: bun examples/multimodalExample.ts <image-or-video> [more files…] [-- "question"]');
  process.exit(1);
}

const llm = new LLM("http://localhost:8080", undefined, undefined, 300);
const attachments = await Promise.all(paths.map((path) => Attachment.fromFile(path)));

const conversation = new Conversation([
    new Message(Role.System, "You're a helpful assistant."),
    Message.user(question, attachments),
]);

const response = await llm.chatCompletion(conversation, new ChatCompletionOptions());
console.log(response.assistantMessage()?.content);
