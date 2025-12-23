//--------------------------------------------------------------
// FILE: src/index.ts
// Shared system bootstrap for Ash core (memory + soma)
//--------------------------------------------------------------

import { CentralNervousSystem } from "./body/CentralNervousSystem.js";
import { VitalsLogger } from "./body/monitor/VitalsLogger.js";
import { initMemorySystem, setMaxStmEntries } from "./memory/memorySystem.js";
import { logger } from "./utils/logger.js";
import { getContextTokensPerMessage, getModelContextLength } from "./utils/env.js";

export const bodySystem = new CentralNervousSystem(
  process.env.BOT_ID || "bot"
);

let vitalsLogger: VitalsLogger | null = null;
let initialized = false;

export async function initAshSystems() {
  if (initialized) return;
  initialized = true;
  await initMemorySystem();
  const contextLen = getModelContextLength();
  const tokensPerMessage = getContextTokensPerMessage();
  const maxStm = Math.floor(contextLen / Math.max(1, tokensPerMessage));
  setMaxStmEntries(maxStm);

  // Start vitals logging
  vitalsLogger = new VitalsLogger(bodySystem, 60_000);

  logger.info("🌿 Ash systems initialized (memory + soma).");
}
