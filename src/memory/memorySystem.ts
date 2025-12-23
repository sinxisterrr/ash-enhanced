//--------------------------------------------------------------
// FILE: src/memory/memorySystem.ts
// IMPROVED VERSION - Stronger semantic recall + anti-hallucination
//--------------------------------------------------------------

import { generateModelOutput } from "../model/Llm.js";
import { DistilledMemory } from "./types.js";
import {
  saveLTM,
  loadLTM,
  getLTMCache,
  saveTraits,
  loadTraits,
  getTraitsCache,
  preloadFileMemory,
} from "./memoryStore.js";
import {
  initBlockMemories,
  getAllArchivalMemories,
  getAllHumanBlocks,
  getAllPersonaBlocks,
} from "./blockMemory.js";
import { logger } from "../utils/logger.js";
import {
  initMemoryDatabase,
  seedMemoryDatabaseFromFiles,
} from "./memoryDb.js";
import { CORE_TRAITS } from "./memoryStore.js";

//--------------------------------------------------------------
// STM — rolling buffer
//--------------------------------------------------------------

export interface STMEntry {
  role: "user" | "assistant";
  text: string;
  createdAt: number;
}

let STM: STMEntry[] = [];
let MAX_STM_ENTRIES = 30;

export function setMaxStmEntries(maxEntries: number) {
  const next = Math.max(5, Math.min(200, Math.floor(maxEntries)));
  MAX_STM_ENTRIES = next;
  if (STM.length > MAX_STM_ENTRIES) {
    STM = STM.slice(-MAX_STM_ENTRIES);
  }
}

export function addToSTM(role: "user" | "assistant", text: string) {
  if (!text) return;

  STM.push({
    role,
    text,
    createdAt: Date.now(),
  });

  if (STM.length > MAX_STM_ENTRIES) STM.shift();
}

export function getSTM(): STMEntry[] {
  return [...STM];
}

//--------------------------------------------------------------
// Distillation buffer
//--------------------------------------------------------------

let DISTILL_BUFFER: STMEntry[] = [];
export const DISTILL_INTERVAL = 12;

//--------------------------------------------------------------
// INIT — no longer loads user memory globally
//--------------------------------------------------------------

export async function initMemorySystem() {
  await initMemoryDatabase();
  await seedMemoryDatabaseFromFiles(
    process.env.BOT_ID || "DEFAULT",
    "__seed__",
    CORE_TRAITS
  );

  // Preload file-backed memory before first response
  await preloadFileMemory();

  // Initialize block memories (archival, human, persona)
  await initBlockMemories();
  const [archival, human, persona] = await Promise.all([
    getAllArchivalMemories(),
    getAllHumanBlocks(),
    getAllPersonaBlocks(),
  ]);
  logger.info(
    `📦 Block memories loaded at boot: archival=${archival.length}, human=${human.length}, persona=${persona.length}`
  );
  logger.info("🧠 Memory system initialized.");
  return;
}

//--------------------------------------------------------------
// Distillation prompt builder
//--------------------------------------------------------------

function buildDistillPrompt(stm: STMEntry[]) {
  const transcript = stm
    .map((m) => `${m.role === "user" ? "User" : "Ash"}: ${m.text}`)
    .join("\n");

  const content = `
Extract ONLY durable memories:

• emotionally meaningful
• identity-relevant
• relationship-relevant
• stable preferences, boundaries, permissions
• recurring routines or important factual anchors
• NEVER summaries or guesses.

If unsure, return exactly "ASK".

Return valid JSON:
[
  { "summary": "...", "type": "...", "tags": ["optional"] }
]

Transcript:
${transcript}
  `.trim();

  return {
    system: "You are a memory distiller. Extract only real LTM.",
    messages: [{ role: "user" as const, content }],
  };
}

//--------------------------------------------------------------
// Safe parse
//--------------------------------------------------------------

function safeParse(raw: string): DistilledMemory[] {
  try {
    if (!raw || raw.includes("ASK-SIN")) return [];

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return [];

    const json = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(json)) return [];

    return json
      .map((m: any) => ({
        summary: (m.summary ?? "").trim(),
        type: m.type?.trim() ?? "misc",
        enabled: true,
        source: "distilled",
        tags: Array.isArray(m.tags) ? m.tags : [],
        createdAt: Date.now(),
      }))
      .filter((m) => m.summary.length > 0);
  } catch (err) {
    logger.warn("Distill parse error:", err);
    return [];
  }
}

//--------------------------------------------------------------
// maybeDistill - Now returns extracted memories for notification
//--------------------------------------------------------------

export async function maybeDistill(userId: string): Promise<DistilledMemory[]> {
  // Add current turn to distill buffer
  const recentSTM = getSTM().slice(-2); // Last user + assistant exchange
  DISTILL_BUFFER.push(...recentSTM);

  if (DISTILL_BUFFER.length < DISTILL_INTERVAL) return [];

  try {
    const prompt = buildDistillPrompt(DISTILL_BUFFER);
    const raw = await generateModelOutput(prompt);

    const extracted = safeParse(raw);

    if (extracted.length === 0) {
      await saveLTM(userId, [
        ...getLTMCache(userId),
        {
          summary: "Memory gap detected — Ashriel must ask Sile directly.",
          type: "system",
          enabled: true,
          source: "system",
          createdAt: Date.now(),
        },
      ]);

      DISTILL_BUFFER = [];
      return [];
    }

    const merged = await saveLTM(userId, [
      ...getLTMCache(userId),
      ...extracted,
    ]);

    logger.info(`✨ Distilled ${extracted.length} new memories (LTM now ${merged.length})`);
    
    DISTILL_BUFFER = [];
    return extracted; // Return for notification
  } catch (err) {
    logger.error("Distillation failed:", err);
    DISTILL_BUFFER = [];
    return [];
  }
}

//--------------------------------------------------------------
// Accessors
//--------------------------------------------------------------

export function getLTM(userId: string) {
  return getLTMCache(userId);
}

export function getTraits(userId: string) {
  return getTraitsCache(userId);
}

//--------------------------------------------------------------
// Manual memory save
//--------------------------------------------------------------

export async function addManualMemory(
  userId: string,
  input: { summary: string; type?: string; tags?: string[]; source?: string }
) {
  const summary = input.summary?.trim();
  if (!summary) throw new Error("Manual memory requires a summary.");

  const entry: DistilledMemory = {
    summary,
    type: input.type?.trim() ?? "manual",
    enabled: true,
    source: input.source?.trim() ?? "manual",
    tags: input.tags?.filter(Boolean),
    createdAt: Date.now(),
  };

  const merged = await saveLTM(userId, [...getLTMCache(userId), entry]);
  logger.info(`📝 Manual LTM save (now ${merged.length})`);

  return entry;
}

//--------------------------------------------------------------
// IMPROVED SEMANTIC RECALL - Proper scoring instead of weak keywords
//--------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "have", "you", "but", "was",
  "are", "not", "from", "your", "about", "they", "them", "been", "what",
  "when", "there", "then", "were", "to", "of", "in", "on", "a", "an", "it",
  "is", "as", "at", "by", "or", "be", "if", "we", "can", "will", "would",
  "just", "like", "now", "get", "all", "make", "know", "go", "see", "take"
]);

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP_WORDS.has(w));
}

function scoreRelevance(query: string, summary: string, tags: string[] = [], type?: string): number {
  const queryTokens = new Set(tokenize(query));
  const summaryTokens = tokenize(summary);
  
  if (queryTokens.size === 0) return 0;
  
  let score = 0;
  
  // Token overlap scoring
  const matchedTokens = summaryTokens.filter(t => queryTokens.has(t));
  score += matchedTokens.length * 2;
  
  // Exact phrase matching (very strong signal)
  const queryLower = query.toLowerCase().trim();
  const summaryLower = summary.toLowerCase();
  if (queryLower.length > 5 && summaryLower.includes(queryLower)) {
    score += 15;
  }
  
  // Partial phrase matching
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
  for (const phrase of queryWords) {
    if (phrase.length > 4 && summaryLower.includes(phrase)) {
      score += 3;
    }
  }
  
  // Tag matching (strong signal for categorized memories)
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    for (const qt of queryTokens) {
      if (tagSet.has(qt)) {
        score += 5;
      }
    }
  }
  
  // Type relevance
  if (type) {
    const typeLower = type.toLowerCase();
    if (queryLower.includes(typeLower) || typeLower.includes(queryLower)) {
      score += 3;
    }
  }
  
  // Density bonus (higher concentration of matches = more relevant)
  if (summaryTokens.length > 0) {
    const density = matchedTokens.length / summaryTokens.length;
    score += density * 5;
  }
  
  return score;
}

export async function recallRelevantMemories(userId: string, query: string, limit = 6) {
  const ltm = getLTMCache(userId);
  
  if (!query || query.trim().length === 0) {
    // No query - return most recent memories
    return ltm
      .filter(m => m.enabled)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);
  }
  
  const scored = ltm
    .filter((m) => m.enabled)
    .map(m => ({
      memory: m,
      score: scoreRelevance(query, m.summary, m.tags, m.type)
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker: more recent memories
      return (b.memory.createdAt || 0) - (a.memory.createdAt || 0);
    })
    .slice(0, limit);
  
  if (process.env.MEMORY_DEBUG === "true") {
    logger.debug(
      `🔍 Recall: query="${query}" found ${scored.length} matches:`,
      scored.map(s => ({ score: s.score.toFixed(1), summary: s.memory.summary.slice(0, 60) }))
    );
  }
  
  return scored.map(s => s.memory);
}
