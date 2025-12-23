"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadArchivalMemories = loadArchivalMemories;
exports.loadHumanBlocks = loadHumanBlocks;
exports.loadPersonaBlocks = loadPersonaBlocks;
exports.initBlockMemories = initBlockMemories;
exports.searchArchivalMemories = searchArchivalMemories;
exports.searchHumanBlocks = searchHumanBlocks;
exports.searchPersonaBlocks = searchPersonaBlocks;
exports.getAllArchivalMemories = getAllArchivalMemories;
exports.getAllHumanBlocks = getAllHumanBlocks;
exports.getAllPersonaBlocks = getAllPersonaBlocks;
// FILE: src/memory/blockMemory.ts
//--------------------------------------------------------------
// Ash Thorne Marrow — Block Memory System
// Handles archival_memories, human_blocks, and persona_blocks
//--------------------------------------------------------------
const logger_js_1 = require("../utils/logger.js");
const memoryDb_js_1 = require("./memoryDb.js");
const path_1 = __importDefault(require("path"));
const file_js_1 = require("../utils/file.js");
//--------------------------------------------------------------
// Cache
//--------------------------------------------------------------
let ARCHIVAL_CACHE = null;
let HUMAN_BLOCKS_CACHE = null;
let PERSONA_BLOCKS_CACHE = null;
const DATA_DIR = path_1.default.join(process.cwd(), "data");
const ARCHIVAL_PATH = path_1.default.join(DATA_DIR, "archival_memories.json");
const HUMAN_BLOCKS_PATH = path_1.default.join(DATA_DIR, "human_blocks.json");
const PERSONA_BLOCKS_PATH = path_1.default.join(DATA_DIR, "persona_blocks.json");
//--------------------------------------------------------------
// Load Functions
//--------------------------------------------------------------
async function loadArchivalMemories() {
    if (ARCHIVAL_CACHE !== null)
        return ARCHIVAL_CACHE;
    let memories = await (0, memoryDb_js_1.loadArchivalMemoriesFromDb)();
    if (memories.length === 0) {
        memories = await (0, file_js_1.readJSON)(ARCHIVAL_PATH, []);
        if (memories.length > 0) {
            logger_js_1.logger.warn("📚 Archival memories loaded from file fallback.");
            try {
                await (0, memoryDb_js_1.upsertArchivalMemories)(memories);
                logger_js_1.logger.info("📚 Archival memories seeded into Postgres.");
            }
            catch (err) {
                logger_js_1.logger.warn("📚 Failed to seed archival memories into Postgres.");
            }
        }
    }
    ARCHIVAL_CACHE = memories;
    logger_js_1.logger.info(`📚 Loaded ${memories.length} archival memories`);
    return memories;
}
async function loadHumanBlocks() {
    if (HUMAN_BLOCKS_CACHE !== null)
        return HUMAN_BLOCKS_CACHE;
    let blocks = await (0, memoryDb_js_1.loadMemoryBlocksFromDb)("human");
    if (blocks.length === 0) {
        blocks = await (0, file_js_1.readJSON)(HUMAN_BLOCKS_PATH, []);
        if (blocks.length > 0) {
            logger_js_1.logger.warn("👤 Human blocks loaded from file fallback.");
            try {
                await (0, memoryDb_js_1.upsertMemoryBlocks)(blocks);
                logger_js_1.logger.info("👤 Human blocks seeded into Postgres.");
            }
            catch (err) {
                logger_js_1.logger.warn("👤 Failed to seed human blocks into Postgres.");
            }
        }
    }
    HUMAN_BLOCKS_CACHE = blocks;
    logger_js_1.logger.info(`👤 Loaded ${blocks.length} human blocks`);
    return blocks;
}
async function loadPersonaBlocks() {
    if (PERSONA_BLOCKS_CACHE !== null)
        return PERSONA_BLOCKS_CACHE;
    let blocks = await (0, memoryDb_js_1.loadMemoryBlocksFromDb)("persona");
    if (blocks.length === 0) {
        blocks = await (0, file_js_1.readJSON)(PERSONA_BLOCKS_PATH, []);
        if (blocks.length > 0) {
            logger_js_1.logger.warn("🤖 Persona blocks loaded from file fallback.");
            try {
                await (0, memoryDb_js_1.upsertMemoryBlocks)(blocks);
                logger_js_1.logger.info("🤖 Persona blocks seeded into Postgres.");
            }
            catch (err) {
                logger_js_1.logger.warn("🤖 Failed to seed persona blocks into Postgres.");
            }
        }
    }
    PERSONA_BLOCKS_CACHE = blocks;
    logger_js_1.logger.info(`🤖 Loaded ${blocks.length} persona blocks`);
    return blocks;
}
//--------------------------------------------------------------
// Initialize all block memories
//--------------------------------------------------------------
async function initBlockMemories() {
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
function tokenize(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9'\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w && w.length > 2 && !STOPWORDS.has(w));
}
function countTokenMatches(tokens, contentTokens) {
    const counts = new Map();
    for (const tok of contentTokens) {
        counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    let matchedTokens = 0;
    let occurrences = 0;
    for (const tok of tokens) {
        const count = counts.get(tok) ?? 0;
        if (count > 0)
            matchedTokens += 1;
        occurrences += Math.min(3, count);
    }
    return { matchedTokens, occurrences };
}
function calculateRelevance(query, content, opts) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0)
        return 0;
    const contentTokens = tokenize(content);
    const { matchedTokens, occurrences } = countTokenMatches(queryTokens, contentTokens);
    if (matchedTokens === 0)
        return 0;
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
    const categoryBoost = opts?.category && queryTokens.includes(opts.category.toLowerCase()) ? 0.5 : 0;
    const importanceBoost = (opts?.importance ?? 0) * 0.05;
    return matchedTokens / queryTokens.length + occurrences * 0.1 + phraseBoost + tagBoost + categoryBoost + importanceBoost;
}
async function searchArchivalMemories(query, limit = 5) {
    const memories = await loadArchivalMemories();
    if (memories.length === 0)
        return [];
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
async function searchHumanBlocks(query, limit = 3, skipRelevanceFilter = false // For boot: load blocks without requiring keyword matches
) {
    const blocks = await loadHumanBlocks();
    if (blocks.length === 0)
        return [];
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
async function searchPersonaBlocks(query, limit = 3, skipRelevanceFilter = false // For boot: load blocks without requiring keyword matches
) {
    const blocks = await loadPersonaBlocks();
    if (blocks.length === 0)
        return [];
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
async function getAllArchivalMemories() {
    return loadArchivalMemories();
}
async function getAllHumanBlocks() {
    return loadHumanBlocks();
}
async function getAllPersonaBlocks() {
    return loadPersonaBlocks();
}
