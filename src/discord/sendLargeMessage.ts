//--------------------------------------------------------------
// FILE: src/discord/sendLargeMessage.ts
// Send long replies across multiple Discord messages
//--------------------------------------------------------------

import type { Message } from "discord.js";

const MAX_CHUNK = 1900;

function chunkText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + limit, text.length);
    let slice = text.slice(i, end);

    if (end < text.length) {
      const lastNewline = slice.lastIndexOf("\n");
      if (lastNewline > limit * 0.6) {
        end = i + lastNewline + 1;
        slice = text.slice(i, end);
      }
    }

    chunks.push(slice);
    i = end;
  }

  return chunks;
}

export async function sendLargeMessage(
  message: Message,
  content: string
): Promise<void> {
  const chunks = chunkText(content, MAX_CHUNK);
  if (chunks.length === 0) return;

  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const channel = message.channel as { send?: (content: string) => Promise<any> };
    if (typeof channel.send === "function") {
      await channel.send(chunks[i]);
    }
  }
}
