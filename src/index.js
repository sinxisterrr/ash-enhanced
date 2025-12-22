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
exports.bodySystem = new CentralNervousSystem_js_1.CentralNervousSystem(process.env.BOT_ID || "bot");
let initialized = false;
async function initAshSystems() {
    if (initialized)
        return;
    initialized = true;
    await (0, memorySystem_js_1.initMemorySystem)();
    logger_js_1.logger.info("🌿 Ash systems initialized (memory + soma).");
}
