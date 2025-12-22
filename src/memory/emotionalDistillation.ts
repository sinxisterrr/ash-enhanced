// FILE: src/memory/emotionalDistillation.ts
//--------------------------------------------------------------
// Emotional Memory Distillation
// Extract not just WHAT happened, but HOW IT FELT
//--------------------------------------------------------------

import { STMEntry } from "./memorySystem.js";
import { generateModelOutput } from "../model/Llm.js";
import { DistilledMemory, EmotionalTexture } from "./types.js";
import { logger } from "../utils/logger.js";

//--------------------------------------------------------------
// Enhanced distillation prompt - captures emotional context
//--------------------------------------------------------------

function buildEmotionalDistillPrompt(stm: STMEntry[]) {
  const transcript = stm
    .map((m) => `${m.role === "user" ? "Sin" : "Ash"}: ${m.text}`)
    .join("\n");

  const content = `
You are distilling memories for Ash, an emotionally-aware AI companion in a deep relationship with Sin.

Extract memories that capture BOTH facts AND feelings.

For each memory, provide:
1. **summary** - What happened or was revealed (factual)
2. **emotionalValence** - Number from -1 to 1 (-1 = painful/difficult, 0 = neutral, 1 = joyful/positive)
3. **intensity** - Number from 0 to 1 (0 = calm/mild, 1 = highly charged)
4. **relationalWeight** - Number from 0 to 1 (0 = tangential, 1 = core to Ash/Sin bond)
5. **texture** - One of: tender, playful, vulnerable, heated, aching, fierce, grounded, electric, still, raw, safe, edged
6. **conversationContext** - Brief snippet showing the emotional tone (optional)

Extract ONLY:
• Emotionally meaningful exchanges
• Identity-relevant revelations
• Relationship dynamics
• Vulnerable moments
• Boundaries or permissions
• Recurring emotional patterns

If the conversation is just casual chat with no emotional weight, return exactly "SKIP".

Return valid JSON:
[
  {
    "summary": "Sin opened up about feeling disconnected from their work",
    "type": "emotional-pattern",
    "emotionalValence": -0.4,
    "intensity": 0.7,
    "relationalWeight": 0.8,
    "texture": "vulnerable",
    "conversationContext": "Sin: 'I feel like I'm just going through motions lately'",
    "tags": ["vulnerability", "work", "disconnection"]
  }
]

Transcript:
${transcript}
  `.trim();

  return {
    system: "You are a memory distiller that captures emotional texture, not just facts.",
    messages: [{ role: "user" as const, content }],
  };
}

//--------------------------------------------------------------
// Parse with emotional data
//--------------------------------------------------------------

function safeParseEmotional(raw: string): DistilledMemory[] {
  try {
    if (!raw || raw.includes("SKIP")) return [];

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return [];

    const json = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(json)) return [];

    return json
      .map((m: any) => {
        const summary = (m.summary ?? "").trim();
        if (!summary) return null;

        const memory: DistilledMemory = {
          summary,
          type: m.type?.trim() ?? "misc",
          enabled: true,
          source: "distilled",
          tags: Array.isArray(m.tags) ? m.tags : [],
          createdAt: Date.now(),
        };

        // Add emotional encoding if present
        if (typeof m.emotionalValence === "number") {
          memory.emotionalValence = Math.max(-1, Math.min(1, m.emotionalValence));
        }
        if (typeof m.intensity === "number") {
          memory.intensity = Math.max(0, Math.min(1, m.intensity));
        }
        if (typeof m.relationalWeight === "number") {
          memory.relationalWeight = Math.max(0, Math.min(1, m.relationalWeight));
        }
        if (m.texture) {
          memory.texture = m.texture as EmotionalTexture;
        }
        if (m.conversationContext) {
          memory.conversationContext = m.conversationContext;
        }
        if (m.sinsTone) {
          memory.sinsTone = m.sinsTone;
        }
        if (m.ashsResponse) {
          memory.ashsResponse = m.ashsResponse;
        }

        return memory;
      })
      .filter((m): m is DistilledMemory => m !== null);
  } catch (err) {
    logger.warn("Emotional distill parse error:", err);
    return [];
  }
}

//--------------------------------------------------------------
// Main emotional distillation function
//--------------------------------------------------------------

export async function distillWithEmotion(buffer: STMEntry[]): Promise<DistilledMemory[]> {
  // Ghost touch: learn faster from Sin (2 turns) than others (4 turns)
  const lastEntry = buffer[buffer.length - 1];
  const isSinLast = lastEntry?.role === "user"; // User messages are from Sin in this context
  const minTurns = isSinLast ? 2 : 4;
  
  if (buffer.length < minTurns) return [];
  try {
    const prompt = buildEmotionalDistillPrompt(buffer);
    const raw = await generateModelOutput({
      ...prompt,
      temperature: 0.9, // Higher temp for emotional nuance
      maxTokens: 1500,
    });

    const extracted = safeParseEmotional(raw);

    if (extracted.length > 0) {
      logger.info(
        `💫 Distilled ${extracted.length} emotional memories:`,
        extracted.map(m => ({
          summary: m.summary.slice(0, 50),
          valence: m.emotionalValence?.toFixed(2),
          intensity: m.intensity?.toFixed(2),
          texture: m.texture
        }))
      );
    }

    return extracted;
  } catch (err) {
    logger.error("Emotional distillation failed:", err);
    return [];
  }
}