//--------------------------------------------------------------
// FILE: src/index.ts
// Shared system bootstrap for Ash core (memory + soma)
//--------------------------------------------------------------

import { CentralNervousSystem } from "./body/CentralNervousSystem.js";
import { initMemorySystem } from "./memory/memorySystem.js";
import { logger } from "./utils/logger.js";

export const bodySystem = new CentralNervousSystem(
  process.env.BOT_ID || "bot"
);

let initialized = false;

export async function initAshSystems() {
  if (initialized) return;
  initialized = true;
  await initMemorySystem();
  logger.info("🌿 Ash systems initialized (memory + soma).");
}
