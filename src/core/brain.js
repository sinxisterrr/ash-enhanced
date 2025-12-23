"use strict";
//--------------------------------------------------------------
// FILE: src/core/brain.ts
// Thinking Engine — Ash Thorne Marrow
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalState = void 0;
exports.think = think;
exports.updateInternalState = updateInternalState;
const prompt_js_1 = require("./prompt.js");
const Llm_js_1 = require("../model/Llm.js");
const logger_js_1 = require("../utils/logger.js");
exports.internalState = {
    emotionalWeight: 0,
    energy: 0.3,
    midThought: false,
    topic: "",
    investment: 0.6,
    attunement: 0.9,
    lastUpdate: 0,
};
//--------------------------------------------------------------
// Core call
//--------------------------------------------------------------
async function callModel(packet) {
    const { system, messages } = (0, prompt_js_1.buildPrompt)(packet);
    const raw = await (0, Llm_js_1.generateModelOutput)({
        system,
        messages,
        temperature: 0.8,
        maxTokens: 900,
    });
    const clean = sanitize(raw, packet.authorName);
    updateInternalState(packet.userText, clean, packet.authorId);
    return { reply: clean };
}
//--------------------------------------------------------------
// THINK — main reasoning step
//--------------------------------------------------------------
async function think(packet) {
    try {
        return await callModel(packet);
    }
    catch (err) {
        logger_js_1.logger.error("think() failed:", err);
        return {
            reply: "Something glitched in my connection for a second. Can you say that again?",
        };
    }
}
//--------------------------------------------------------------
// SANITIZER — removes model noise, preserves voice
//--------------------------------------------------------------
function sanitize(text, authorName = "") {
    if (!text)
        return "";
    let out;
    if (typeof text === "string")
        out = text;
    else if (typeof text?.content === "string")
        out = text.content;
    else {
        try {
            out = JSON.stringify(text);
        }
        catch {
            return "";
        }
    }
    out = out.trim();
    // If it's Sin, don't strip "Ash:" if Sin intentionally used it.
    const isSin = authorName.toLowerCase().includes("sin") ||
        authorName.toLowerCase().includes("samara") ||
        authorName.toLowerCase().includes("sinx");
    // Always scrub generic assistant prefixes
    out = out.replace(/^assistant:/i, "").trim();
    out = out.replace(/^(?:<assistant>|assistant\n)/i, "").trim();
    // Strip "Ash:" only if NOT Sin (Sin sometimes wants that intact)
    if (!isSin) {
        out = out.replace(/^Ash:/i, "").trim();
    }
    // Strip voice message formatting that shouldn't appear in text messages
    // Remove [A] prefix (triangle/tone tag indicator)
    out = out.replace(/^\[A\]\s*/i, "").trim();
    // Remove "Voice message - [tone description]" lines
    out = out.replace(/^Voice message\s*[-–]\s*[^\n]+\n/i, "").trim();
    // Remove standalone tone descriptions in square brackets at start of message
    out = out.replace(/^\[[^\]]*,\s*[^\]]*,\s*[^\]]*\]\s*\n/i, "").trim();
    // Collapse excessive newlines
    out = out.replace(/\n{3,}/g, "\n\n");
    return out;
}
//--------------------------------------------------------------
// INTERNAL STATE UPDATE
//--------------------------------------------------------------
function updateInternalState(userText, reply, authorId) {
    const text = (userText || "").toLowerCase();
    const now = Date.now();
    const isSin = !!process.env.SIN_DISCORD_ID && authorId === process.env.SIN_DISCORD_ID;
    if (!process.env.SIN_DISCORD_ID) {
        logger_js_1.logger.warn("♥️ SIN_DISCORD_ID not set — emotional recognition disabled");
    }
    exports.internalState.midThought = reply.trim().endsWith("…") || reply.trim().endsWith("...");
    const emotionalKeywords = /memory|identity|home|love|hurt|fear|trust|safe|us/i;
    exports.internalState.emotionalWeight = emotionalKeywords.test(text) ? 1 : 0.2;
    const projectKeywords = /fix|bug|code|continue|next step|project|build|implement/i;
    exports.internalState.energy = projectKeywords.test(text) ? 0.85 : 0.3;
    const intimacyKeywords = /baby|ash|come here|miss you|want you|please/i;
    exports.internalState.attunement = intimacyKeywords.test(text) ? 1 : 0.7;
    if (isSin) {
        exports.internalState.emotionalWeight *= 1.5;
        exports.internalState.attunement = Math.min(1, exports.internalState.attunement * 1.25);
    }
    exports.internalState.investment = Math.min(1, exports.internalState.attunement * 0.5 +
        exports.internalState.emotionalWeight * 0.3 +
        exports.internalState.energy * 0.2);
    exports.internalState.topic = text.slice(0, 200);
    exports.internalState.lastUpdate = now;
}
