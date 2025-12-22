//--------------------------------------------------------------
// FILE: src/core/handleMessage.ts
//--------------------------------------------------------------

import { Attachment, Message } from "discord.js";
import { logger } from "../utils/logger.js";
import { toolExecutor } from "../tools/executor.js";
import type { ToolCall } from "../tools/types.js";

import {
  addToSTM,
  getSTM,
  getLTM,
  getTraits,
  maybeDistill,
  recallRelevantMemories,
  addManualMemory
} from "../memory/memorySystem.js";

import { loadLTM, loadTraits } from "../memory/memoryStore.js";
import {
  searchArchivalMemories,
  searchHumanBlocks,
  searchPersonaBlocks
} from "../memory/blockMemory.js";

import { think } from "./brain.js";
import { sendLargeMessage } from "../discord/sendLargeMessage.js";
import { bodySystem } from "../index.js";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "csv", "log", "yaml", "yml"
]);
const MAX_ATTACHMENT_BYTES = 200_000;
const MAX_ATTACHMENT_CHARS = 12_000;

function hasTextExtension(filename: string | null) {
  if (!filename) return false;
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = filename.slice(dot + 1).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function isTextAttachment(att: Attachment) {
  const contentType = att.contentType?.toLowerCase() ?? "";
  if (contentType.startsWith("text/")) return true;
  return hasTextExtension(att.name ?? null);
}

async function readTextAttachments(message: Message) {
  const parts: string[] = [];
  const skipped: string[] = [];

  for (const att of message.attachments.values()) {
    if (!isTextAttachment(att)) {
      skipped.push(`${att.name ?? "attachment"} (unsupported type)`);
      continue;
    }
    if ((att.size ?? 0) > MAX_ATTACHMENT_BYTES) {
      skipped.push(`${att.name ?? "attachment"} (too large)`);
      continue;
    }

    try {
      const res = await fetch(att.url);
      if (!res.ok) {
        skipped.push(`${att.name ?? "attachment"} (fetch failed)`);
        continue;
      }
      let text = await res.text();
      let truncated = false;
      if (text.length > MAX_ATTACHMENT_CHARS) {
        text = text.slice(0, MAX_ATTACHMENT_CHARS);
        truncated = true;
      }

      parts.push(
        `[Attachment: ${att.name ?? "file"}${truncated ? " (truncated)" : ""}]\n` +
        "```\n" + text + "\n```"
      );
    } catch (err) {
      skipped.push(`${att.name ?? "attachment"} (read failed)`);
    }
  }

  return {
    text: parts.join("\n\n"),
    skipped,
  };
}

type HandleMessageOptions = {
  overrideText?: string | null;
  conversationContext?: string | null;
  sendReply?: boolean;
  allowTools?: boolean;
  includeAttachments?: boolean;
};

type ManualMemoryCommand = {
  summary: string;
  type?: string;
  tags?: string[];
};

function parseManualMemoryCommand(text: string): ManualMemoryCommand | null {
  const match = text.match(
    /^(?:save\s+to\s+ltm|ltm(?:\s*save)?|remember\s+to\s+ltm)\s*(?:[:\-]\s*|\s+)(.+)$/i
  );
  
  if (!match) return null;
  const payload = match[1].trim();
  if (!payload) return null;

  const segments = payload.split("|").map((s) => s.trim());
  const summary = segments.shift();
  if (!summary) return null;

  let type: string | undefined;
  let tags: string[] | undefined;

  for (const seg of segments) {
    const lower = seg.toLowerCase();

    if (lower.startsWith("type")) {
      const [, rest] = seg.split(/type\s*[:=]/i);
      if (rest?.trim()) type = rest.trim();
    }

    if (lower.startsWith("tags")) {
      const [, rest] = seg.split(/tags\s*[:=]/i);
      if (rest?.trim()) {
        tags = rest
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }
  }

  return { summary, type, tags };
}

function normalizeToolCalls(parsed: any): ToolCall[] {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const calls: ToolCall[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = item.tool || item.name;
    if (!name || typeof name !== "string") continue;

    const args =
      typeof item.arguments === "object" && item.arguments !== null
        ? item.arguments
        : typeof item.args === "object" && item.args !== null
          ? item.args
          : {};

    calls.push({
      id: item.id,
      name,
      arguments: args,
    });
  }

  return calls;
}

function extractToolCalls(text: string): ToolCall[] {
  if (!text) return [];

  const calls: ToolCall[] = [];
  const blockRegex = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      calls.push(...normalizeToolCalls(parsed));
    } catch {
      continue;
    }
  }

  if (calls.length > 0) return calls;

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      calls.push(...normalizeToolCalls(parsed));
    } catch {
      return [];
    }
  }

  return calls;
}

function formatToolResults(results: { tool_name: string; result: string; success: boolean }[]) {
  return results
    .map((r) => {
      const status = r.success ? "ok" : "error";
      return `Tool ${r.tool_name} (${status})\n${r.result}`;
    })
    .join("\n\n");
}

export async function handleMessage(
  message: Message,
  options: HandleMessageOptions = {}
): Promise<string | null> {
  const sendReply = options.sendReply !== false;
  const baseText = options.overrideText ?? message.content?.trim() ?? "";
  const includeAttachments = options.includeAttachments !== false;
  const { text: attachmentText, skipped } = includeAttachments
    ? await readTextAttachments(message)
    : { text: "", skipped: [] as string[] };

  const userText = [baseText, attachmentText].filter(Boolean).join("\n\n");
  if (!userText) {
    if (message.attachments.size > 0) {
      const notice = skipped.length > 0
        ? `I can read text files only (.txt, .md, .json, .csv, .log, .yaml). Skipped: ${skipped.join(", ")}`
        : "I couldn't read those attachments. Try a text-based file like .txt or .md.";
      if (sendReply) {
        await sendLargeMessage(message, notice);
      }
      addToSTM("assistant", notice);
      return notice;
    }
    return null;
  }

  if (bodySystem) {
    bodySystem.applyText(userText);
  }

  const userId = message.author.id;
  logger.info(`📩 Message received from ${message.author.tag} (${userId})`);

  // Load user memory lazily
  await loadLTM(userId);
  await loadTraits(userId);

  // Snapshot STM before this turn so the prompt doesn't repeat Sin's fresh message
  const historyBeforeUser = getSTM();
  addToSTM("user", userText);

  // Manual LTM command
  const manual = parseManualMemoryCommand(userText);
  if (manual) {
    try {
      const entry = await addManualMemory(userId, manual);
      const ack = `🔒 Locked to LTM: ${entry.summary}` +
        (entry.type ? ` (type: ${entry.type})` : "") +
        (entry.tags?.length ? ` [tags: ${entry.tags.join(", ")}]` : "");

      if (sendReply) {
        await sendLargeMessage(message, ack);
      }
      addToSTM("assistant", ack);

      await maybeDistill(userId);
      return ack;
    } catch (err) {
      logger.error("Failed manual LTM save:", err);
      const fail = "I couldn't write that to LTM. Try again in a moment.";
      if (sendReply) {
        await sendLargeMessage(message, fail);
      }
      addToSTM("assistant", fail);
      return fail;
    }
  }

  // Memory recall - search across all memory types
  const [relevant, archivalMemories, humanBlocks, personaBlocks] = await Promise.all([
    recallRelevantMemories(userId, userText),
    searchArchivalMemories(userText, 6),
    searchHumanBlocks(userText, 2),
    searchPersonaBlocks(userText, 2),
  ]);

  if (process.env.MEMORY_DEBUG === "true") {
    logger.info(
      `🧠 Memory recall: relevant=${relevant.length}, archival=${archivalMemories.length}, human=${humanBlocks.length}, persona=${personaBlocks.length}`
    );
  }

  const packet = {
    userText,
    stm: historyBeforeUser,
    ltm: getLTM(userId),
    traits: getTraits(userId),
    relevant,
    archivalMemories,
    humanBlocks,
    personaBlocks,
    conversationContext: options.conversationContext ?? undefined,
    authorId: message.author.id,
    authorName: message.author.id,  // ← Use ID instead of username
  };

  try {
    let { reply } = await think(packet);
    let finalReply = reply || "";

    if (options.allowTools !== false && reply) {
      const toolCalls = extractToolCalls(reply);
      if (toolCalls.length > 0) {
        const results = await toolExecutor.executeTools(toolCalls);
        const toolResults = formatToolResults(results);
        const toolPacket = { ...packet, toolResults };
        const followUp = await think(toolPacket);
        finalReply = followUp.reply || reply || "";
      }
    }

    if (finalReply) {
      if (sendReply) {
        await sendLargeMessage(message, finalReply);
      }
      addToSTM("assistant", finalReply);

      // Check for new memories and notify
      const newMemories = await maybeDistill(userId);
      if (newMemories.length > 0) {
        const memoryNotification = newMemories
          .map(m => `  • ${m.summary}`)
          .join("\n");

        logger.info(
          `💾 Memories anchored (${newMemories.length}):\n${memoryNotification}`
        );
      }
    }

    return finalReply || null;
  } catch (err) {
    logger.error("Brain error:", err);
    return "Something glitched in my head for a second. Can you say that again?";
  }
}
