"use strict";
// FILE: src/utils/memoryDiagnostics.ts
//--------------------------------------------------------------
// Memory System Diagnostics - See what Ash actually remembers
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnoseMemoryRecall = diagnoseMemoryRecall;
exports.showFullMemoryState = showFullMemoryState;
const memorySystem_js_1 = require("../memory/memorySystem.js");
const memorySystem_js_2 = require("../memory/memorySystem.js");
const blockMemory_js_1 = require("../memory/blockMemory.js");
const logger_js_1 = require("./logger.js");
async function diagnoseMemoryRecall(userId, query) {
    logger_js_1.logger.info(`\n${"=".repeat(80)}`);
    logger_js_1.logger.info(`🔍 MEMORY DIAGNOSTIC FOR QUERY: "${query}"`);
    logger_js_1.logger.info(`${"=".repeat(80)}`);
    const ltm = (0, memorySystem_js_1.getLTM)(userId);
    const traits = (0, memorySystem_js_1.getTraits)(userId);
    logger_js_1.logger.info(`\n📊 TOTAL MEMORY COUNTS:`);
    logger_js_1.logger.info(`  • LTM entries: ${ltm.length}`);
    logger_js_1.logger.info(`  • Traits: ${traits.length}`);
    logger_js_1.logger.info(`\n🧠 ALL LTM ENTRIES:`);
    ltm.forEach((m, i) => {
        logger_js_1.logger.info(`  ${i + 1}. [${m.type}] ${m.summary}`);
        if (m.tags && m.tags.length > 0) {
            logger_js_1.logger.info(`     Tags: ${m.tags.join(", ")}`);
        }
    });
    logger_js_1.logger.info(`\n🎯 RECALL TEST FOR: "${query}"`);
    const relevant = await (0, memorySystem_js_2.recallRelevantMemories)(userId, query, 6);
    const [archival, human, persona] = await Promise.all([
        (0, blockMemory_js_1.searchArchivalMemories)(query, 4),
        (0, blockMemory_js_1.searchHumanBlocks)(query, 2),
        (0, blockMemory_js_1.searchPersonaBlocks)(query, 2),
    ]);
    logger_js_1.logger.info(`\n  Relevant LTM: ${relevant.length}`);
    relevant.forEach((m, i) => {
        logger_js_1.logger.info(`    ${i + 1}. ${m.summary}`);
    });
    logger_js_1.logger.info(`\n  Archival: ${archival.length}`);
    archival.forEach((m, i) => {
        logger_js_1.logger.info(`    ${i + 1}. ${m.content.slice(0, 100)}...`);
    });
    logger_js_1.logger.info(`\n  Human blocks: ${human.length}`);
    human.forEach((b, i) => {
        logger_js_1.logger.info(`    ${i + 1}. [${b.label}] ${b.content.slice(0, 100)}...`);
    });
    logger_js_1.logger.info(`\n  Persona blocks: ${persona.length}`);
    persona.forEach((b, i) => {
        logger_js_1.logger.info(`    ${i + 1}. [${b.label}] ${b.content.slice(0, 100)}...`);
    });
    logger_js_1.logger.info(`\n${"=".repeat(80)}\n`);
}
async function showFullMemoryState(userId) {
    const ltm = (0, memorySystem_js_1.getLTM)(userId);
    const traits = (0, memorySystem_js_1.getTraits)(userId);
    console.log("\n" + "=".repeat(80));
    console.log("FULL MEMORY STATE FOR USER:", userId);
    console.log("=".repeat(80));
    console.log("\n📚 LTM ENTRIES (" + ltm.length + "):");
    ltm.forEach((m, i) => {
        console.log(`\n${i + 1}. ${m.summary}`);
        console.log(`   Type: ${m.type} | Source: ${m.source} | Enabled: ${m.enabled}`);
        if (m.tags && m.tags.length > 0) {
            console.log(`   Tags: ${m.tags.join(", ")}`);
        }
        console.log(`   Created: ${new Date(m.createdAt).toISOString()}`);
    });
    console.log("\n\n🎨 TRAITS (" + traits.length + "):");
    traits.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t}`);
    });
    console.log("\n" + "=".repeat(80) + "\n");
}
