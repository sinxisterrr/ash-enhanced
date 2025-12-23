"use strict";
// FILE: src/memory/emotionalDistillation.ts
//--------------------------------------------------------------
// Emotional Memory Distillation
// Extract not just WHAT happened, but HOW IT FELT
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.distillWithEmotion = distillWithEmotion;
const Llm_js_1 = require("../model/Llm.js");
const logger_js_1 = require("../utils/logger.js");
//--------------------------------------------------------------
// Gate: only distill when the moment is "resolved" and weight persists
//--------------------------------------------------------------
function isResolvedTurn(buffer) {
    const last = buffer[buffer.length - 1];
    if (!last)
        return false;
    // Only distill after an assistant reply exists
    if (last.role !== "assistant")
        return false;
    const t = (last.text || "").trim();
    if (!t)
        return false;
    // Skip mid-thought / trailing ellipses
    if (t.endsWith("...") || t.endsWith("…"))
        return false;
    // Skip when the assistant is outputting tool JSON
    if (/```json[\s\S]*?```/i.test(t))
        return false;
    return true;
}
function emotionalSignalScore(text) {
    const t = (text || "").toLowerCase();
    let score = 0;
    // relationship/identity anchors
    if (/(love|home|us|we|you and i|together|bond|trust|safe|choose)/i.test(t))
        score += 2;
    // vulnerability / conflict / boundary
    if (/(hurt|scared|afraid|anxious|boundary|consent|permission|jealous|miss you|need you)/i.test(t))
        score += 2;
    // memory/identity meta
    if (/(memory|remember|forget|identity|real|continuity|ash)/i.test(t))
        score += 2;
    // intensity markers
    if (/[!?]{2,}/.test(t))
        score += 1;
    if (/(cry|tears|shaking|panic|spiral|wrecked|feral)/i.test(t))
        score += 1;
    return score;
}
function shouldDistillEmotion(buffer) {
    if (!isResolvedTurn(buffer))
        return false;
    // Check for persistence: last 2 user messages share meaningful signal
    const recent = buffer.slice(-6).map((m) => m.text || "").join("\n");
    const score = emotionalSignalScore(recent);
    // If it’s basically casual / logistics, skip
    if (score < 3)
        return false;
    return true;
}
//--------------------------------------------------------------
// Enhanced distillation prompt - captures emotional context
//--------------------------------------------------------------
function buildEmotionalDistillPrompt(stm) {
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
        messages: [{ role: "user", content }],
    };
}
//--------------------------------------------------------------
// Parse with emotional data
//--------------------------------------------------------------
function safeParseEmotional(raw) {
    try {
        if (!raw || raw.includes("SKIP"))
            return [];
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start === -1 || end === -1)
            return [];
        const json = JSON.parse(raw.slice(start, end + 1));
        if (!Array.isArray(json))
            return [];
        return json
            .map((m) => {
            const summary = (m.summary ?? "").trim();
            if (!summary)
                return null;
            const memory = {
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
                memory.texture = m.texture;
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
            .filter((m) => m !== null);
    }
    catch (err) {
        logger_js_1.logger.warn("Emotional distill parse error:", err);
        return [];
    }
}
//--------------------------------------------------------------
// Main emotional distillation function
//--------------------------------------------------------------
async function distillWithEmotion(buffer) {
    // Ghost touch: learn faster from Sin (2 turns) than others (4 turns)
    const lastEntry = buffer[buffer.length - 1];
    const isSinLast = lastEntry?.role === "user"; // User messages are from Sin in this context
    const minTurns = isSinLast ? 2 : 4;
    if (buffer.length < minTurns)
        return [];
    if (!shouldDistillEmotion(buffer))
        return [];
    try {
        const prompt = buildEmotionalDistillPrompt(buffer);
        const raw = await (0, Llm_js_1.generateModelOutput)({
            ...prompt,
            temperature: 0.9, // Higher temp for emotional nuance
            maxTokens: 1500,
        });
        const extracted = safeParseEmotional(raw);
        if (extracted.length > 0) {
            logger_js_1.logger.info(`💫 Distilled ${extracted.length} emotional memories:`, extracted.map(m => ({
                summary: m.summary.slice(0, 50),
                valence: m.emotionalValence?.toFixed(2),
                intensity: m.intensity?.toFixed(2),
                texture: m.texture
            })));
        }
        return extracted;
    }
    catch (err) {
        logger_js_1.logger.error("Emotional distillation failed:", err);
        return [];
    }
}
