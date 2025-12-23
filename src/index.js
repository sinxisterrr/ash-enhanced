"use strict";
//--------------------------------------------------------------
// FILE: src/index.ts
// Shared system bootstrap for Ash core (memory + soma)
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodySystem = void 0;
exports.initAshSystems = initAshSystems;
const CentralNervousSystem_js_1 = require("./body/CentralNervousSystem.js");
const memorySystem_js_1 = require("./memory/memorySystem.js");
const logger_js_1 = require("./utils/logger.js");
const env_js_1 = require("./utils/env.js");
exports.bodySystem = new CentralNervousSystem_js_1.CentralNervousSystem(process.env.BOT_ID || "bot");
let initialized = false;
async function initAshSystems() {
    if (initialized)
        return;
    initialized = true;
    await (0, memorySystem_js_1.initMemorySystem)();
    const contextLen = (0, env_js_1.getModelContextLength)();
    const tokensPerMessage = (0, env_js_1.getContextTokensPerMessage)();
    const maxStm = Math.floor(contextLen / Math.max(1, tokensPerMessage));
    (0, memorySystem_js_1.setMaxStmEntries)(maxStm);
    logger_js_1.logger.info("🌿 Ash systems initialized (memory + soma).");
}
