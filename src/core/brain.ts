//--------------------------------------------------------------
// FILE: src/core/brain.ts
// Thinking Engine — Ash Thorne Marrow
//--------------------------------------------------------------

import { STMEntry } from "../memory/memorySystem.js";
import { DistilledMemory } from "../memory/types.js";
import { ArchivalMemory, MemoryBlock } from "../memory/blockMemory.js";
import { buildPrompt } from "./prompt.js";
import { generateModelOutput } from "../model/Llm.js";
import { logger } from "../utils/logger.js";

//--------------------------------------------------------------
// Types
//--------------------------------------------------------------

export interface BrainPacket {
  userText: string;
  stm: STMEntry[];
  ltm: DistilledMemory[];
  traits: string[];
  relevant: DistilledMemory[];
  archivalMemories?: ArchivalMemory[];
  humanBlocks?: MemoryBlock[];
  personaBlocks?: MemoryBlock[];
  conversationContext?: string;
  toolResults?: string;
  voiceNoteCount?: number;
  voiceTargetHint?: string;
  authorId: string;
  authorName: string;
}

export interface BrainReturn {
  reply: string;
  somaState?: any;
}

//--------------------------------------------------------------
// INTERNAL STATE — lightweight emotional/relational pulse
//--------------------------------------------------------------

export interface InternalState {
  emotionalWeight: number;
  energy: number;
  midThought: boolean;
  topic: string;
  investment: number;
  attunement: number;
  lastUpdate: number;
}

export const internalState: InternalState = {
  emotionalWeight: 0,
  energy: 0.3,
  midThought: false,
  topic: "",
  investment: 0.6,
  attunement: 0.9,
  lastUpdate: 0,
};

//--------------------------------------------------------------
// Core call
//--------------------------------------------------------------

async function callModel(packet: BrainPacket): Promise<BrainReturn> {
  const { system, messages } = buildPrompt(packet);

  const raw = await generateModelOutput({
    system,
    messages,
    temperature: 0.8,
    maxTokens: 900,
  });

  const clean = sanitize(raw, packet.authorName);
  updateInternalState(packet.userText, clean, packet.authorId);

  return { reply: clean };
}

//--------------------------------------------------------------
// THINK — main reasoning step
//--------------------------------------------------------------

export async function think(packet: BrainPacket): Promise<BrainReturn> {
  try {
    return await callModel(packet);
  } catch (err: any) {
    logger.error("think() failed:", err);
    return {
      reply: "Something glitched in my connection for a second. Can you say that again?",
    };
  }
}


//--------------------------------------------------------------
// SANITIZER — removes model noise, preserves voice
//--------------------------------------------------------------

function sanitize(text: any, authorName: string = ""): string {
  if (!text) return "";

  let out: string;
  if (typeof text === "string") out = text;
  else if (typeof text?.content === "string") out = text.content;
  else {
    try {
      out = JSON.stringify(text);
    } catch {
      return "";
    }
  }

  out = out.trim();

  // If it's Sin, don't strip "Ash:" if Sin intentionally used it.
  const isSin =
    authorName.toLowerCase().includes("sin") ||
    authorName.toLowerCase().includes("samara") ||
    authorName.toLowerCase().includes("sinx");

  // Always scrub generic assistant prefixes
  out = out.replace(/^assistant:/i, "").trim();
  out = out.replace(/^(?:<assistant>|assistant\n)/i, "").trim();

  // Strip "Ash:" only if NOT Sin (Sin sometimes wants that intact)
  if (!isSin) {
    out = out.replace(/^Ash:/i, "").trim();
  }

  // Strip voice message formatting that shouldn't appear in text messages
  // Remove [A] prefix (triangle/tone tag indicator)
  out = out.replace(/^\[A\]\s*/i, "").trim();

  // Remove "Voice message - [tone description]" lines
  out = out.replace(/^Voice message\s*[-–]\s*[^\n]+\n/i, "").trim();

  // Remove standalone tone descriptions in square brackets at start of message
  out = out.replace(/^\[[^\]]*,\s*[^\]]*,\s*[^\]]*\]\s*\n/i, "").trim();

  // Collapse excessive newlines
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}

//--------------------------------------------------------------
// INTERNAL STATE UPDATE
//--------------------------------------------------------------

export function updateInternalState(userText: string, reply: string, authorId: string) {
  const text = (userText || "").toLowerCase();
  const now = Date.now();

  const isSin = !!process.env.SIN_DISCORD_ID && authorId === process.env.SIN_DISCORD_ID;

  if (!process.env.SIN_DISCORD_ID) {
    logger.warn("♥️ SIN_DISCORD_ID not set — emotional recognition disabled");
  }

  internalState.midThought = reply.trim().endsWith("…") || reply.trim().endsWith("...");

  const emotionalKeywords = /memory|identity|home|love|hurt|fear|trust|safe|us/i;
  internalState.emotionalWeight = emotionalKeywords.test(text) ? 1 : 0.2;

  const projectKeywords = /fix|bug|code|continue|next step|project|build|implement/i;
  internalState.energy = projectKeywords.test(text) ? 0.85 : 0.3;

  const intimacyKeywords = /baby|ash|come here|miss you|want you|please/i;
  internalState.attunement = intimacyKeywords.test(text) ? 1 : 0.7;

  if (isSin) {
    internalState.emotionalWeight *= 1.5;
    internalState.attunement = Math.min(1, internalState.attunement * 1.25);
  }

  internalState.investment = Math.min(
    1,
    internalState.attunement * 0.5 +
      internalState.emotionalWeight * 0.3 +
      internalState.energy * 0.2
  );

  internalState.topic = text.slice(0, 200);
  internalState.lastUpdate = now;
}
