//--------------------------------------------------------------
// Environment loader – typed and safe
//--------------------------------------------------------------

import dotenv from "dotenv";
dotenv.config();

export interface EnvConfig {
  DISCORD_BOT_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  MODEL_PROVIDER: string;
  OLLAMA_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_API_KEY?: string;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  RUNPOD_OLLAMA_URL?: string;
  RUNPOD_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OLLAMA_CONTEXT_LENGTH?: string;
  OPENAI_CONTEXT_LENGTH?: string;
  OPENROUTER_CONTEXT_LENGTH?: string;
  CONTEXT_TOKENS_PER_MESSAGE?: string;
}

export function loadEnv(): EnvConfig {
  const {
    DISCORD_BOT_TOKEN,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    MODEL_PROVIDER,
    OLLAMA_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_API_KEY,
    OLLAMA_CONTEXT_LENGTH,
    CLAUDE_API_KEY,
    CLAUDE_MODEL,
    RUNPOD_OLLAMA_URL,
    RUNPOD_API_KEY,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    OPENAI_CONTEXT_LENGTH,
    OPENROUTER_CONTEXT_LENGTH,
    CONTEXT_TOKENS_PER_MESSAGE,
  } = process.env;

  if (!DISCORD_BOT_TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN");
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
    OLLAMA_CONTEXT_LENGTH,

    CLAUDE_API_KEY,
    CLAUDE_MODEL: CLAUDE_MODEL || "claude-3-sonnet-20240229",

    RUNPOD_OLLAMA_URL,
    RUNPOD_API_KEY,

    OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENAI_CONTEXT_LENGTH,
    OPENROUTER_CONTEXT_LENGTH,
    CONTEXT_TOKENS_PER_MESSAGE,
  };
}

export function getModelContextLength(): number {
  const env = loadEnv();
  const provider = (env.MODEL_PROVIDER || "ollama").toLowerCase();

  if (provider === "openai") {
    return parseInt(env.OPENAI_CONTEXT_LENGTH || "8192", 10);
  }

  if (provider === "openrouter") {
    return parseInt(env.OPENROUTER_CONTEXT_LENGTH || "8192", 10);
  }

  return parseInt(env.OLLAMA_CONTEXT_LENGTH || "32768", 10);
}

export function getContextTokensPerMessage(): number {
  const env = loadEnv();
  return parseInt(env.CONTEXT_TOKENS_PER_MESSAGE || "200", 10);
}
