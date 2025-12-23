"use strict";
// FILE: src/memory/memoryDb.ts
//--------------------------------------------------------------
// Postgres-backed memory storage (Railway-compatible)
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMemoryDatabase = initMemoryDatabase;
exports.getBotMemoryRow = getBotMemoryRow;
exports.upsertBotMemoryRow = upsertBotMemoryRow;
exports.upsertArchivalMemories = upsertArchivalMemories;
exports.upsertMemoryBlocks = upsertMemoryBlocks;
exports.loadArchivalMemoriesFromDb = loadArchivalMemoriesFromDb;
exports.loadMemoryBlocksFromDb = loadMemoryBlocksFromDb;
exports.getCategoryPrompt = getCategoryPrompt;
exports.upsertCategoryPrompt = upsertCategoryPrompt;
exports.listCategoryPrompts = listCategoryPrompts;
exports.deleteCategoryPrompt = deleteCategoryPrompt;
exports.seedMemoryDatabaseFromFiles = seedMemoryDatabaseFromFiles;
const pg_1 = __importDefault(require("pg"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("../utils/logger.js");
const file_js_1 = require("../utils/file.js");
const DATA_DIR = path_1.default.join(process.cwd(), "data");
const BOT_MEMORY_PATH = path_1.default.join(DATA_DIR, "bot_memory.json");
const ARCHIVAL_PATH = path_1.default.join(DATA_DIR, "archival_memories.json");
const HUMAN_BLOCKS_PATH = path_1.default.join(DATA_DIR, "human_blocks.json");
const PERSONA_BLOCKS_PATH = path_1.default.join(DATA_DIR, "persona_blocks.json");
const LTM_PATH = path_1.default.join(DATA_DIR, "ltm.json");
const DATABASE_URL = process.env.DATABASE_URL;
let DB_DISABLED_LOGGED = false;
const REQUIRE_SSL = process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require";
const { Pool } = pg_1.default;
let pool = null;
function logDbDisabledOnce() {
    if (!DB_DISABLED_LOGGED) {
        DB_DISABLED_LOGGED = true;
        logger_js_1.logger.warn("🧠 Postgres memory store disabled (DATABASE_URL missing). Using file/in-memory fallback.");
    }
}
function getPool() {
    if (!DATABASE_URL) {
        logDbDisabledOnce();
        return null;
    }
    if (!pool) {
        pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: REQUIRE_SSL ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pool;
}
function toJsonValue(value) {
    if (value === undefined)
        return null;
    if (value === null)
        return null;
    return JSON.stringify(value);
}
async function initMemoryDatabase() {
    const db = getPool();
    if (!db)
        return;
    await db.query(`
    CREATE TABLE IF NOT EXISTS bot_memory (
      bot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ltm JSONB NOT NULL DEFAULT '[]'::jsonb,
      traits JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, user_id)
    );
  `);
    await db.query(`
    CREATE TABLE IF NOT EXISTS archival_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT,
      importance DOUBLE PRECISION,
      timestamp BIGINT,
      tags JSONB,
      metadata JSONB
    );
  `);
    await db.query(`
    CREATE TABLE IF NOT EXISTS memory_blocks (
      block_type TEXT NOT NULL,
      label TEXT NOT NULL,
      content TEXT NOT NULL,
      description TEXT,
      metadata JSONB,
      limit_value INTEGER,
      read_only BOOLEAN,
      PRIMARY KEY (block_type, label)
    );
  `);
    await db.query(`
    CREATE TABLE IF NOT EXISTS category_prompts (
      category_id TEXT PRIMARY KEY,
      category_name TEXT,
      prompt_modifications TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
async function getBotMemoryRow(botId, userId) {
    const db = getPool();
    if (!db)
        return null;
    const { rows } = await db.query(`
      SELECT bot_id, user_id, ltm, traits, updated_at
      FROM bot_memory
      WHERE bot_id = $1 AND user_id = $2
      LIMIT 1
    `, [botId, userId]);
    return rows[0] ?? null;
}
async function upsertBotMemoryRow(row) {
    const db = getPool();
    if (!db)
        return;
    await db.query(`
      INSERT INTO bot_memory (bot_id, user_id, ltm, traits, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bot_id, user_id)
      DO UPDATE SET ltm = EXCLUDED.ltm, traits = EXCLUDED.traits, updated_at = EXCLUDED.updated_at
    `, [
        row.bot_id,
        row.user_id,
        toJsonValue(row.ltm),
        toJsonValue(row.traits),
        row.updated_at,
    ]);
}
async function upsertArchivalMemories(memories) {
    if (memories.length === 0)
        return;
    const db = getPool();
    if (!db)
        return;
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        for (const mem of memories) {
            await client.query(`
          INSERT INTO archival_memories (id, content, category, importance, timestamp, tags, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id)
          DO UPDATE SET
            content = EXCLUDED.content,
            category = EXCLUDED.category,
            importance = EXCLUDED.importance,
            timestamp = EXCLUDED.timestamp,
            tags = EXCLUDED.tags,
            metadata = EXCLUDED.metadata
        `, [
                mem.id,
                mem.content,
                mem.category ?? null,
                mem.importance ?? null,
                mem.timestamp ? Math.floor(mem.timestamp) : null,
                toJsonValue(mem.tags),
                toJsonValue(mem.metadata),
            ]);
        }
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
async function upsertMemoryBlocks(blocks) {
    if (blocks.length === 0)
        return;
    const db = getPool();
    if (!db)
        return;
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        for (const block of blocks) {
            await client.query(`
          INSERT INTO memory_blocks (
            block_type, label, content, description, metadata, limit_value, read_only
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (block_type, label)
          DO UPDATE SET
            content = EXCLUDED.content,
            description = EXCLUDED.description,
            metadata = EXCLUDED.metadata,
            limit_value = EXCLUDED.limit_value,
            read_only = EXCLUDED.read_only
        `, [
                block.block_type,
                block.label,
                block.content,
                block.description ?? null,
                toJsonValue(block.metadata),
                block.limit ?? null,
                block.read_only ?? null,
            ]);
        }
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
async function loadArchivalMemoriesFromDb() {
    const db = getPool();
    if (!db)
        return [];
    const { rows } = await db.query(`SELECT id, content, category, importance, timestamp, tags, metadata FROM archival_memories`);
    return rows;
}
async function loadMemoryBlocksFromDb(blockType) {
    const db = getPool();
    if (!db)
        return [];
    const { rows } = await db.query(`
      SELECT label, block_type, content, description, metadata, limit_value as limit, read_only
      FROM memory_blocks
      WHERE block_type = $1
    `, [blockType]);
    return rows;
}
async function getCategoryPrompt(categoryId) {
    const db = getPool();
    if (!db)
        return null;
    const { rows } = await db.query(`
      SELECT category_id, category_name, prompt_modifications, enabled, created_at, updated_at
      FROM category_prompts
      WHERE category_id = $1 AND enabled = true
      LIMIT 1
    `, [categoryId]);
    return rows[0] ?? null;
}
async function upsertCategoryPrompt(config) {
    const db = getPool();
    if (!db)
        return;
    await db.query(`
      INSERT INTO category_prompts (category_id, category_name, prompt_modifications, enabled, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (category_id)
      DO UPDATE SET
        category_name = EXCLUDED.category_name,
        prompt_modifications = EXCLUDED.prompt_modifications,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `, [
        config.category_id,
        config.category_name ?? null,
        config.prompt_modifications,
        config.enabled,
    ]);
}
async function listCategoryPrompts() {
    const db = getPool();
    if (!db)
        return [];
    const { rows } = await db.query(`SELECT category_id, category_name, prompt_modifications, enabled, created_at, updated_at
     FROM category_prompts
     ORDER BY category_name, category_id`);
    return rows;
}
async function deleteCategoryPrompt(categoryId) {
    const db = getPool();
    if (!db)
        return;
    await db.query(`DELETE FROM category_prompts WHERE category_id = $1`, [categoryId]);
}
async function seedMemoryDatabaseFromFiles(botId, seedUserId, seedTraits) {
    const db = getPool();
    if (!db)
        return;
    const [{ count: botCount }] = (await db.query("SELECT COUNT(*)::text AS count FROM bot_memory")).rows;
    const [{ count: archivalCount }] = (await db.query("SELECT COUNT(*)::text AS count FROM archival_memories")).rows;
    const [{ count: blockCount }] = (await db.query("SELECT COUNT(*)::text AS count FROM memory_blocks")).rows;
    const hasBotMemory = Number(botCount) > 0;
    const hasArchival = Number(archivalCount) > 0;
    const hasBlocks = Number(blockCount) > 0;
    if (hasBotMemory && hasArchival && hasBlocks) {
        logger_js_1.logger.info("🗄️  Memory DB already seeded; skipping file import.");
        return;
    }
    const botMemory = await (0, file_js_1.readJSON)(BOT_MEMORY_PATH, null);
    const archival = await (0, file_js_1.readJSON)(ARCHIVAL_PATH, []);
    const humanBlocks = await (0, file_js_1.readJSON)(HUMAN_BLOCKS_PATH, []);
    const personaBlocks = await (0, file_js_1.readJSON)(PERSONA_BLOCKS_PATH, []);
    const ltmSeed = await (0, file_js_1.readJSON)(LTM_PATH, []);
    if (!hasBotMemory && botMemory) {
        const rows = [];
        for (const [fileBotId, users] of Object.entries(botMemory)) {
            for (const [userId, row] of Object.entries(users)) {
                rows.push({
                    bot_id: row.bot_id || fileBotId,
                    user_id: row.user_id || userId,
                    ltm: row.ltm ?? [],
                    traits: row.traits ?? [],
                    updated_at: row.updated_at || new Date().toISOString(),
                });
            }
        }
        for (const row of rows) {
            await upsertBotMemoryRow(row);
        }
    }
    if (!hasBotMemory && ltmSeed.length > 0) {
        await db.query(`
      INSERT INTO bot_memory (bot_id, user_id, ltm, traits, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bot_id, user_id)
      DO UPDATE SET ltm = EXCLUDED.ltm, traits = EXCLUDED.traits, updated_at = EXCLUDED.updated_at
      `, [
            botId,
            seedUserId,
            toJsonValue(ltmSeed),
            toJsonValue(seedTraits),
            new Date().toISOString(),
        ]);
    }
    if (!hasArchival) {
        await upsertArchivalMemories(archival);
    }
    if (!hasBlocks) {
        await upsertMemoryBlocks(humanBlocks);
        await upsertMemoryBlocks(personaBlocks);
    }
    logger_js_1.logger.info(`🗄️  Seeded memory DB: archival=${archival.length}, human=${humanBlocks.length}, persona=${personaBlocks.length}`);
}
