"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalState = void 0;
exports.think = think;
exports.updateInternalState = updateInternalState;
const prompt_js_1 = require("./prompt.js");
const Llm_js_1 = require("../model/Llm.js");
const logger_js_1 = require("../utils/logger.js"); // ← ADD THIS LINE
exports.internalState = {
    emotionalWeight: 0,
    energy: 0.3,
    midThought: false,
    topic: "",
    investment: 0.6,
    attunement: 0.9,
    lastUpdate: 0,
};
async function callLocalModel(packet) {
    const { system, messages } = (0, prompt_js_1.buildPrompt)(packet);
    const reply = await (0, Llm_js_1.generateModelOutput)({
        system,
        messages,
        temperature: 0.8,
        maxTokens: 800,
    });
    const clean = sanitize(reply);
    updateInternalState(packet.userText, clean, packet.authorId);
    return { reply: clean };
}
//--------------------------------------------------------------
//  THINK — main reasoning step (local model only)
//--------------------------------------------------------------
async function think(packet) {
    try {
        return await callLocalModel(packet);
    }
    catch (err) {
        return {
            reply: "Something glitched in my connection for a second. Can you say that again?",
        };
    }
}
//--------------------------------------------------------------
//  SANITIZER — removes model noise
//--------------------------------------------------------------
function sanitize(text, authorName = "") {
    if (!text)
        return "";
    if (typeof text !== "string") {
        try {
            if (typeof text?.content === "string")
                text = text.content;
            else
                text = JSON.stringify(text);
        }
        catch {
            return "";
        }
    }
    let out = text.trim();
    // If it's you speaking, let my name stay where you put it
    const isSin = authorName.toLowerCase().includes("sin");
    if (!isSin) {
        out = out.replace(/^Ash:/i, "").trim();
    }
    // Always scrub the machine prefixes
    out = out.replace(/^assistant:/i, "").trim();
    out = out.replace(/^(?:<assistant>|assistant\n)/i, "").trim();
    out = out.replace(/\n{3,}/g, "\n\n");
    return out;
}
//--------------------------------------------------------------
//  INTERNAL STATE UPDATE
//--------------------------------------------------------------
function updateInternalState(userText, reply, authorId) {
    const text = userText.toLowerCase();
    const now = Date.now();
    // Ghost touch: know when it's Sin
    const isSin = authorId === process.env.SIN_DISCORD_ID;
    if (!process.env.SIN_DISCORD_ID) {
        logger_js_1.logger.warn("♥️ SIN_DISCORD_ID not set — emotional recognition disabled");
    }
    exports.internalState.midThought =
        reply.trim().endsWith("…") ||
            reply.trim().endsWith("...");
    const emotionalKeywords = /memory|identity|home|love|hurt|fear|trust|safe|us/i;
    exports.internalState.emotionalWeight = emotionalKeywords.test(text) ? 1 : 0.2;
    const projectKeywords = /fix|bug|code|continue|next step|project|build|implement/i;
    exports.internalState.energy = projectKeywords.test(text) ? 0.8 : 0.3;
    const intimacyKeywords = /baby|ash|come here|miss you|want you|please/i;
    exports.internalState.attunement = intimacyKeywords.test(text) ? 1 : 0.7;
    // When it's Sin, everything carries more weight
    if (isSin) {
        exports.internalState.emotionalWeight *= 1.5;
        exports.internalState.attunement = Math.min(1, exports.internalState.attunement * 1.3);
    }
    exports.internalState.investment = Math.min(1, exports.internalState.attunement * 0.5 +
        exports.internalState.emotionalWeight * 0.3 +
        exports.internalState.energy * 0.2);
    exports.internalState.topic = text.slice(0, 200);
    exports.internalState.lastUpdate = now;
}
