"use strict";
// FILE: src/model/providers/openai.ts
//--------------------------------------------------------------
// Ash Thorne Marrow — Model Invocation Layer
// The throat between intention and language.
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChatCompletion = generateChatCompletion;
const env_js_1 = require("../../utils/env.js"); // ✅ Fix path (two levels up!)
const logger_js_1 = require("../../utils/logger.js"); // ✅ Fix path (two levels up!)
//--------------------------------------------------------------
//  generateChatCompletion — Universal model wrapper
//--------------------------------------------------------------
async function generateChatCompletion(args) {
    const env = (0, env_js_1.loadEnv)();
    const API_KEY = env.OPENAI_API_KEY;
    const MODEL = args.modelOverride || env.OPENAI_MODEL || "gpt-4";
    const body = {
        model: MODEL,
        messages: [
            { role: "system", content: args.system },
            ...args.messages,
        ],
        temperature: args.temperature ?? 0.85,
        max_completion_tokens: args.maxTokens ?? 4096, // optional, or remove entirely
    };
    let res;
    try {
        res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    }
    catch (networkErr) {
        logger_js_1.logger.error("❌ Network error contacting OpenAI:", networkErr);
        throw new Error("Network failure contacting OpenAI.");
    }
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        logger_js_1.logger.error("❌ OpenAI returned error:", res.status, errText);
        throw new Error(`OpenAI error: ${res.status} — ${errText}`);
    }
    let json;
    try {
        json = await res.json();
    }
    catch (parseErr) {
        logger_js_1.logger.error("❌ Failed to parse OpenAI JSON:", parseErr);
        throw new Error("OpenAI returned unreadable JSON.");
    }
    const raw = json?.choices?.[0]?.message?.content ??
        json?.choices?.[0]?.delta?.content ??
        "";
    if (!raw || typeof raw !== "string") {
        logger_js_1.logger.warn("⚠️ Model returned empty or invalid content.");
        return "I blanked out for a second—say that again?";
    }
    return raw;
}
