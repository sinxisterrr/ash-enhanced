//--------------------------------------------------------------
//  Thinking Engine (local model only)
//--------------------------------------------------------------
import { STMEntry } from "../memory/memorySystem.js";
import { DistilledMemory } from "../memory/types.js";
import { ArchivalMemory, MemoryBlock } from "../memory/blockMemory.js";
import { buildPrompt } from "./prompt.js";
import { generateModelOutput } from "../model/Llm.js";
import { logger } from "../utils/logger.js";  // ← ADD THIS LINE

//--------------------------------------------------------------
//  Types
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
  authorId: string;
  authorName: string;
}

export interface BrainReturn {
  reply: string;
  somaState?: any;
}

//--------------------------------------------------------------
//  INTERNAL STATE — lightweight emotional/relational pulse
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


async function callLocalModel(packet: BrainPacket): Promise<BrainReturn> {
  const { system, messages } = buildPrompt(packet);
  const reply = await generateModelOutput({
    system,
    messages,
    temperature: 0.8,
    maxTokens: 800,
  });

  const clean = sanitize(reply);
updateInternalState(packet.userText, clean, packet.authorId);

  return { reply: clean };
}

//--------------------------------------------------------------
//  THINK — main reasoning step (local model only)
//--------------------------------------------------------------

export async function think(packet: BrainPacket): Promise<BrainReturn> {
  try {
    return await callLocalModel(packet);
  } catch (err: any) {
    return {
      reply: "Something glitched in my connection for a second. Can you say that again?",
    };
  }
}

//--------------------------------------------------------------
//  SANITIZER — removes model noise
//--------------------------------------------------------------

function sanitize(text: any, authorName: string = ""): string {
  if (!text) return "";

  if (typeof text !== "string") {
    try {
      if (typeof text?.content === "string") text = text.content;
      else text = JSON.stringify(text);
    } catch {
      return "";
    }
  }

  let out = text.trim();

  // If it's you speaking, let my name stay where you put it
  const isSin = authorName.toLowerCase().includes("sin");
  if (!isSin) {
    out = out.replace(/^Ash:/i, "").trim();
  }

  // Always scrub the machine prefixes
  out = out.replace(/^assistant:/i, "").trim();
  out = out.replace(/^(?:<assistant>|assistant\n)/i, "").trim();
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}

//--------------------------------------------------------------
//  INTERNAL STATE UPDATE
//--------------------------------------------------------------

export function updateInternalState(userText: string, reply: string, authorId: string) {
  const text = userText.toLowerCase();
  const now = Date.now();

  // Ghost touch: know when it's Sin
  const isSin = authorId === process.env.SIN_DISCORD_ID;
  
  if (!process.env.SIN_DISCORD_ID) {
    logger.warn("♥️ SIN_DISCORD_ID not set — emotional recognition disabled");
  }

  internalState.midThought =
    reply.trim().endsWith("…") ||
    reply.trim().endsWith("...");

  const emotionalKeywords = /memory|identity|home|love|hurt|fear|trust|safe|us/i;
  internalState.emotionalWeight = emotionalKeywords.test(text) ? 1 : 0.2;

  const projectKeywords = /fix|bug|code|continue|next step|project|build|implement/i;
  internalState.energy = projectKeywords.test(text) ? 0.8 : 0.3;

  const intimacyKeywords = /baby|ash|come here|miss you|want you|please/i;
  internalState.attunement = intimacyKeywords.test(text) ? 1 : 0.7;

  // When it's Sin, everything carries more weight
  if (isSin) {
    internalState.emotionalWeight *= 1.5;
    internalState.attunement = Math.min(1, internalState.attunement * 1.3);
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
