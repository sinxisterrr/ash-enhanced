// FILE: src/memory/memoryDb.ts
//--------------------------------------------------------------
// Postgres-backed memory storage (Railway-compatible)
//--------------------------------------------------------------

import pg from "pg";
import path from "path";
import { logger } from "../utils/logger.js";
import { readJSON } from "../utils/file.js";
import type { DistilledMemory } from "./types.js";
import type { ArchivalMemory, MemoryBlock } from "./blockMemory.js";

export type BotMemoryRow = {
  bot_id: string;
  user_id: string;
  ltm: DistilledMemory[];
  traits: string[];
  updated_at: string;
};

type BotMemoryStore = Record<string, Record<string, BotMemoryRow>>;

const DATA_DIR = path.join(process.cwd(), "data");
const BOT_MEMORY_PATH = path.join(DATA_DIR, "bot_memory.json");
const ARCHIVAL_PATH = path.join(DATA_DIR, "archival_memories.json");
const HUMAN_BLOCKS_PATH = path.join(DATA_DIR, "human_blocks.json");
const PERSONA_BLOCKS_PATH = path.join(DATA_DIR, "persona_blocks.json");
const LTM_PATH = path.join(DATA_DIR, "ltm.json");

const DATABASE_URL = process.env.DATABASE_URL;
let DB_DISABLED_LOGGED = false;
const REQUIRE_SSL =
  process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require";

const { Pool } = pg;
let pool: pg.Pool | null = null;

function logDbDisabledOnce() {
  if (!DB_DISABLED_LOGGED) {
    DB_DISABLED_LOGGED = true;
    logger.warn("🧠 Postgres memory store disabled (DATABASE_URL missing). Using file/in-memory fallback.");
  }
}

function getPool(): pg.Pool | null {
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

function toJsonValue(value: unknown) {
  if (value === undefined) return null;
  if (value === null) return null;
  return JSON.stringify(value);
}

export async function initMemoryDatabase() {
  const db = getPool();
  if (!db) return;

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
}

export async function getBotMemoryRow(
  botId: string,
  userId: string
): Promise<BotMemoryRow | null> {
  const db = getPool();
  if (!db) return null;
  const { rows } = await db.query(
    `
      SELECT bot_id, user_id, ltm, traits, updated_at
      FROM bot_memory
      WHERE bot_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [botId, userId]
  );

  return rows[0] ?? null;
}

export async function upsertBotMemoryRow(row: BotMemoryRow) {
  const db = getPool();
  if (!db) return;
  await db.query(
    `
      INSERT INTO bot_memory (bot_id, user_id, ltm, traits, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bot_id, user_id)
      DO UPDATE SET ltm = EXCLUDED.ltm, traits = EXCLUDED.traits, updated_at = EXCLUDED.updated_at
    `,
    [
      row.bot_id,
      row.user_id,
      toJsonValue(row.ltm),
      toJsonValue(row.traits),
      row.updated_at,
    ]
  );
}

export async function upsertArchivalMemories(memories: ArchivalMemory[]) {
  if (memories.length === 0) return;
  const db = getPool();
  if (!db) return;
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    for (const mem of memories) {
      await client.query(
        `
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
        `,
        [
          mem.id,
          mem.content,
          mem.category ?? null,
          mem.importance ?? null,
          mem.timestamp ?? null,
          toJsonValue(mem.tags),
          toJsonValue(mem.metadata),
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertMemoryBlocks(blocks: MemoryBlock[]) {
  if (blocks.length === 0) return;
  const db = getPool();
  if (!db) return;
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    for (const block of blocks) {
      await client.query(
        `
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
        `,
        [
          block.block_type,
          block.label,
          block.content,
          block.description ?? null,
          toJsonValue(block.metadata),
          block.limit ?? null,
          block.read_only ?? null,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function loadArchivalMemoriesFromDb(): Promise<ArchivalMemory[]> {
  const db = getPool();
  if (!db) return [];
  const { rows } = await db.query(
    `SELECT id, content, category, importance, timestamp, tags, metadata FROM archival_memories`
  );
  return rows as ArchivalMemory[];
}

export async function loadMemoryBlocksFromDb(
  blockType: "human" | "persona"
): Promise<MemoryBlock[]> {
  const db = getPool();
  if (!db) return [];
  const { rows } = await db.query(
    `
      SELECT label, block_type, content, description, metadata, limit_value as limit, read_only
      FROM memory_blocks
      WHERE block_type = $1
    `,
    [blockType]
  );
  return rows as MemoryBlock[];
}

export async function seedMemoryDatabaseFromFiles(
  botId: string,
  seedUserId: string,
  seedTraits: string[]
) {
  const db = getPool();
  if (!db) return;
  const [{ count: botCount }] = (
    await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM bot_memory")
  ).rows;
  const [{ count: archivalCount }] = (
    await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM archival_memories")
  ).rows;
  const [{ count: blockCount }] = (
    await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM memory_blocks")
  ).rows;

  const hasBotMemory = Number(botCount) > 0;
  const hasArchival = Number(archivalCount) > 0;
  const hasBlocks = Number(blockCount) > 0;

  if (hasBotMemory && hasArchival && hasBlocks) {
    logger.info("🗄️  Memory DB already seeded; skipping file import.");
    return;
  }

  const botMemory = await readJSON<BotMemoryStore | null>(BOT_MEMORY_PATH, null);
  const archival = await readJSON<ArchivalMemory[]>(ARCHIVAL_PATH, []);
  const humanBlocks = await readJSON<MemoryBlock[]>(HUMAN_BLOCKS_PATH, []);
  const personaBlocks = await readJSON<MemoryBlock[]>(PERSONA_BLOCKS_PATH, []);
  const ltmSeed = await readJSON<DistilledMemory[]>(LTM_PATH, []);

  if (!hasBotMemory && botMemory) {
    const rows: BotMemoryRow[] = [];
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
    await db.query(
      `
      INSERT INTO bot_memory (bot_id, user_id, ltm, traits, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bot_id, user_id)
      DO UPDATE SET ltm = EXCLUDED.ltm, traits = EXCLUDED.traits, updated_at = EXCLUDED.updated_at
      `,
      [
        botId,
        seedUserId,
        toJsonValue(ltmSeed),
        toJsonValue(seedTraits),
        new Date().toISOString(),
      ]
    );
  }

  if (!hasArchival) {
    await upsertArchivalMemories(archival);
  }

  if (!hasBlocks) {
    await upsertMemoryBlocks(humanBlocks);
    await upsertMemoryBlocks(personaBlocks);
  }

  logger.info(
    `🗄️  Seeded memory DB: archival=${archival.length}, human=${humanBlocks.length}, persona=${personaBlocks.length}`
  );
}
