// FILE: src/memory/blockMemory.ts
//--------------------------------------------------------------
// Ash Thorne Marrow — Block Memory System
// Handles archival_memories, human_blocks, and persona_blocks
//--------------------------------------------------------------
import { logger } from "../utils/logger.js";
import {
  loadArchivalMemoriesFromDb,
  loadMemoryBlocksFromDb,
  upsertArchivalMemories,
  upsertMemoryBlocks,
} from "./memoryDb.js";
import path from "path";
import { readJSON } from "../utils/file.js";

//--------------------------------------------------------------
// Types
//--------------------------------------------------------------

export interface ArchivalMemory {
  id: string;
  content: string;
  category?: string;
  importance?: number;
  timestamp?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface MemoryBlock {
  label: string;
  block_type: "human" | "persona";
  content: string;
  description?: string;
  metadata?: Record<string, any>;
  limit?: number;
  read_only?: boolean;
}

//--------------------------------------------------------------
// Cache
//--------------------------------------------------------------

let ARCHIVAL_CACHE: ArchivalMemory[] | null = null;
let HUMAN_BLOCKS_CACHE: MemoryBlock[] | null = null;
let PERSONA_BLOCKS_CACHE: MemoryBlock[] | null = null;

const DATA_DIR = path.join(process.cwd(), "data");
const ARCHIVAL_PATH = path.join(DATA_DIR, "archival_memories.json");
const HUMAN_BLOCKS_PATH = path.join(DATA_DIR, "human_blocks.json");
const PERSONA_BLOCKS_PATH = path.join(DATA_DIR, "persona_blocks.json");

//--------------------------------------------------------------
// Load Functions
//--------------------------------------------------------------

export async function loadArchivalMemories(): Promise<ArchivalMemory[]> {
  if (ARCHIVAL_CACHE !== null) return ARCHIVAL_CACHE;
  
  let memories = await loadArchivalMemoriesFromDb();
  if (memories.length === 0) {
    memories = await readJSON<ArchivalMemory[]>(ARCHIVAL_PATH, []);
    if (memories.length > 0) {
      logger.warn("📚 Archival memories loaded from file fallback.");
      try {
        await upsertArchivalMemories(memories);
        logger.info("📚 Archival memories seeded into Postgres.");
      } catch (err) {
        logger.warn("📚 Failed to seed archival memories into Postgres.");
      }
    }
  }
  ARCHIVAL_CACHE = memories;
  logger.info(`📚 Loaded ${memories.length} archival memories`);
  return memories;
}

export async function loadHumanBlocks(): Promise<MemoryBlock[]> {
  if (HUMAN_BLOCKS_CACHE !== null) return HUMAN_BLOCKS_CACHE;
  
  let blocks = await loadMemoryBlocksFromDb("human");
  if (blocks.length === 0) {
    blocks = await readJSON<MemoryBlock[]>(HUMAN_BLOCKS_PATH, []);
    if (blocks.length > 0) {
      logger.warn("👤 Human blocks loaded from file fallback.");
      try {
        await upsertMemoryBlocks(blocks);
        logger.info("👤 Human blocks seeded into Postgres.");
      } catch (err) {
        logger.warn("👤 Failed to seed human blocks into Postgres.");
      }
    }
  }
  HUMAN_BLOCKS_CACHE = blocks;
  logger.info(`👤 Loaded ${blocks.length} human blocks`);
  return blocks;
}

export async function loadPersonaBlocks(): Promise<MemoryBlock[]> {
  if (PERSONA_BLOCKS_CACHE !== null) return PERSONA_BLOCKS_CACHE;
  
  let blocks = await loadMemoryBlocksFromDb("persona");
  if (blocks.length === 0) {
    blocks = await readJSON<MemoryBlock[]>(PERSONA_BLOCKS_PATH, []);
    if (blocks.length > 0) {
      logger.warn("🤖 Persona blocks loaded from file fallback.");
      try {
        await upsertMemoryBlocks(blocks);
        logger.info("🤖 Persona blocks seeded into Postgres.");
      } catch (err) {
        logger.warn("🤖 Failed to seed persona blocks into Postgres.");
      }
    }
  }
  PERSONA_BLOCKS_CACHE = blocks;
  logger.info(`🤖 Loaded ${blocks.length} persona blocks`);
  return blocks;
}

//--------------------------------------------------------------
// Initialize all block memories
//--------------------------------------------------------------

export async function initBlockMemories() {
  await Promise.all([
    loadArchivalMemories(),
    loadHumanBlocks(),
    loadPersonaBlocks(),
  ]);
}

//--------------------------------------------------------------
// Search/Recall Functions
//--------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "that",
  "this", "was", "were", "have", "has", "had", "from", "they", "them", "then",
  "just", "like", "what", "when", "how", "why", "who", "all", "can", "cant",
  "about", "into", "out", "over", "under", "more", "less", "very", "also",
  "its", "it's", "im", "i'm", "we", "our", "us", "me", "my", "mine"
]);

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOPWORDS.has(w));
}

function countTokenMatches(tokens: string[], contentTokens: string[]) {
  const counts = new Map<string, number>();
  for (const tok of contentTokens) {
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }

  let matchedTokens = 0;
  let occurrences = 0;

  for (const tok of tokens) {
    const count = counts.get(tok) ?? 0;
    if (count > 0) matchedTokens += 1;
    occurrences += Math.min(3, count);
  }

  return { matchedTokens, occurrences };
}

function calculateRelevance(
  query: string,
  content: string,
  opts?: { tags?: string[]; category?: string; importance?: number }
): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const contentTokens = tokenize(content);
  const { matchedTokens, occurrences } = countTokenMatches(queryTokens, contentTokens);
  if (matchedTokens === 0) return 0;

  const lowerQuery = query.toLowerCase().trim();
  const lowerContent = (content || "").toLowerCase();
  const phraseBoost = lowerQuery.length > 3 && lowerContent.includes(lowerQuery) ? 1 : 0;

  let tagBoost = 0;
  if (opts?.tags?.length) {
    const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
    for (const tok of queryTokens) {
      if (tagSet.has(tok)) {
        tagBoost = 0.5;
        break;
      }
    }
  }

  const categoryBoost =
    opts?.category && queryTokens.includes(opts.category.toLowerCase()) ? 0.5 : 0;
  const importanceBoost = (opts?.importance ?? 0) * 0.05;

  return matchedTokens / queryTokens.length + occurrences * 0.1 + phraseBoost + tagBoost + categoryBoost + importanceBoost;
}

export async function searchArchivalMemories(
  query: string,
  limit: number = 5
): Promise<ArchivalMemory[]> {
  const memories = await loadArchivalMemories();
  if (memories.length === 0) return [];
  
  const scored = memories.map((mem) => ({
    memory: mem,
    score: calculateRelevance(query, mem.content, {
      tags: mem.tags,
      category: mem.category,
      importance: mem.importance,
    }),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.memory);
}

export async function searchHumanBlocks(
  query: string,
  limit: number = 3,
  skipRelevanceFilter: boolean = false  // For boot: load blocks without requiring keyword matches
): Promise<MemoryBlock[]> {
  const blocks = await loadHumanBlocks();
  if (blocks.length === 0) return [];

  const scored = blocks.map((block) => ({
    block,
    score: calculateRelevance(query, block.content),
  }));

  scored.sort((a, b) => b.score - a.score);

  // If skipRelevanceFilter (boot mode), return top N by score even if score is 0
  if (skipRelevanceFilter) {
    return scored.slice(0, limit).map((s) => s.block);
  }

  // Normal mode: only return blocks with score > 0
  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.block);
}

export async function searchPersonaBlocks(
  query: string,
  limit: number = 3,
  skipRelevanceFilter: boolean = false  // For boot: load blocks without requiring keyword matches
): Promise<MemoryBlock[]> {
  const blocks = await loadPersonaBlocks();
  if (blocks.length === 0) return [];

  const scored = blocks.map((block) => ({
    block,
    score: calculateRelevance(query, block.content),
  }));

  scored.sort((a, b) => b.score - a.score);

  // If skipRelevanceFilter (boot mode), return top N by score even if score is 0
  if (skipRelevanceFilter) {
    return scored.slice(0, limit).map((s) => s.block);
  }

  // Normal mode: only return blocks with score > 0
  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.block);
}

//--------------------------------------------------------------
// Get all (for prompt building)
//--------------------------------------------------------------

export async function getAllArchivalMemories(): Promise<ArchivalMemory[]> {
  return loadArchivalMemories();
}

export async function getAllHumanBlocks(): Promise<MemoryBlock[]> {
  return loadHumanBlocks();
}

export async function getAllPersonaBlocks(): Promise<MemoryBlock[]> {
  return loadPersonaBlocks();
}
