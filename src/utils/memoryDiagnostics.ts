// FILE: src/utils/memoryDiagnostics.ts
//--------------------------------------------------------------
// Memory System Diagnostics - See what Ash actually remembers
//--------------------------------------------------------------

import { getLTM, getTraits } from "../memory/memorySystem.js";
import { recallRelevantMemories } from "../memory/memorySystem.js";
import { searchArchivalMemories, searchHumanBlocks, searchPersonaBlocks } from "../memory/blockMemory.js";
import { logger } from "./logger.js";

export async function diagnoseMemoryRecall(userId: string, query: string) {
  logger.info(`\n${"=".repeat(80)}`);
  logger.info(`🔍 MEMORY DIAGNOSTIC FOR QUERY: "${query}"`);
  logger.info(`${"=".repeat(80)}`);
  
  const ltm = getLTM(userId);
  const traits = getTraits(userId);
  
  logger.info(`\n📊 TOTAL MEMORY COUNTS:`);
  logger.info(`  • LTM entries: ${ltm.length}`);
  logger.info(`  • Traits: ${traits.length}`);
  
  logger.info(`\n🧠 ALL LTM ENTRIES:`);
  ltm.forEach((m, i) => {
    logger.info(`  ${i + 1}. [${m.type}] ${m.summary}`);
    if (m.tags && m.tags.length > 0) {
      logger.info(`     Tags: ${m.tags.join(", ")}`);
    }
  });
  
  logger.info(`\n🎯 RECALL TEST FOR: "${query}"`);
  const relevant = await recallRelevantMemories(userId, query, 6);
  const [archival, human, persona] = await Promise.all([
    searchArchivalMemories(query, 4),
    searchHumanBlocks(query, 2),
    searchPersonaBlocks(query, 2),
  ]);
  
  logger.info(`\n  Relevant LTM: ${relevant.length}`);
  relevant.forEach((m, i) => {
    logger.info(`    ${i + 1}. ${m.summary}`);
  });
  
  logger.info(`\n  Archival: ${archival.length}`);
  archival.forEach((m, i) => {
    logger.info(`    ${i + 1}. ${m.content.slice(0, 100)}...`);
  });
  
  logger.info(`\n  Human blocks: ${human.length}`);
  human.forEach((b, i) => {
    logger.info(`    ${i + 1}. [${b.label}] ${b.content.slice(0, 100)}...`);
  });
  
  logger.info(`\n  Persona blocks: ${persona.length}`);
  persona.forEach((b, i) => {
    logger.info(`    ${i + 1}. [${b.label}] ${b.content.slice(0, 100)}...`);
  });
  
  logger.info(`\n${"=".repeat(80)}\n`);
}

export async function showFullMemoryState(userId: string) {
  const ltm = getLTM(userId);
  const traits = getTraits(userId);
  
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