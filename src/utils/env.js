"use strict";
//--------------------------------------------------------------
// Environment loader – typed and safe
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function loadEnv() {
    const { DISCORD_BOT_TOKEN, OPENAI_API_KEY, OPENAI_MODEL, MODEL_PROVIDER, OLLAMA_MODEL, OLLAMA_BASE_URL, OLLAMA_API_KEY, CLAUDE_API_KEY, CLAUDE_MODEL, RUNPOD_OLLAMA_URL, RUNPOD_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL, } = process.env;
    if (!DISCORD_BOT_TOKEN)
        throw new Error("Missing DISCORD_BOT_TOKEN");
    const provider = (MODEL_PROVIDER || "ollama").toLowerCase();
    if (provider === "openai" && !OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    return {
        DISCORD_BOT_TOKEN,
        OPENAI_API_KEY: OPENAI_API_KEY || "",
        OPENAI_MODEL: OPENAI_MODEL || "gpt-5.1",
        MODEL_PROVIDER: provider,
        OLLAMA_MODEL,
        OLLAMA_BASE_URL,
        OLLAMA_API_KEY,
        CLAUDE_API_KEY,
        CLAUDE_MODEL: CLAUDE_MODEL || "claude-3-sonnet-20240229",
        RUNPOD_OLLAMA_URL,
        RUNPOD_API_KEY,
        OPENROUTER_API_KEY,
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    };
}
