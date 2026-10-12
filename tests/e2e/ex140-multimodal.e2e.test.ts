import { describe, expect, test } from 'bun:test';
import { Attachment } from '../../src/Attachment';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { CHAT_ENDPOINT, CHAT_MODALITIES } from './support/servers';

const FIXTURES = `${import.meta.dir}/fixtures`;

async function askColor(attachment: Attachment): Promise<string> {
  const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
  const conversation = new Conversation([
    new Message(Role.System, 'You are a concise assistant. Answer with a single English word.'),
    Message.user(`What single color fills this ${attachment.kind}?`, [attachment]),
  ]);

  const response = await llm.chatCompletion(conversation, new ChatCompletionOptions(undefined, 0.1, 0.9));

  return response.assistantMessage()?.content.toLowerCase() ?? '';
}

describe('e2e: multimodal user messages', () => {
  test.skipIf(!CHAT_MODALITIES.vision)('describes an attached image', async () => {
    expect(await askColor(await Attachment.fromFile(`${FIXTURES}/red.png`))).toContain('red');
  }, 120000);

  test.skipIf(!CHAT_MODALITIES.video)('describes an attached video', async () => {
    expect(await askColor(await Attachment.fromFile(`${FIXTURES}/blue.mp4`))).toContain('blue');
  }, 120000);
});
