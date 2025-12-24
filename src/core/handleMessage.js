"use strict";
//--------------------------------------------------------------
// FILE: src/core/handleMessage.ts
//--------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessage = handleMessage;
const logger_js_1 = require("../utils/logger.js");
const executor_js_1 = require("../tools/executor.js");
const whisper_js_1 = require("../transcription/whisper.js");
const memorySystem_js_1 = require("../memory/memorySystem.js");
const memoryStore_js_1 = require("../memory/memoryStore.js");
const blockMemory_js_1 = require("../memory/blockMemory.js");
const memoryDb_js_1 = require("../memory/memoryDb.js");
const brain_js_1 = require("./brain.js");
const sendLargeMessage_js_1 = require("../discord/sendLargeMessage.js");
const index_js_1 = require("../index.js");
// Boot flag - true until first message is processed with full context
let needsBootRefresh = true;
const TEXT_EXTENSIONS = new Set([
    "txt", "md", "json", "csv", "log", "yaml", "yml"
]);
const MAX_ATTACHMENT_BYTES = 200000;
const MAX_ATTACHMENT_CHARS = 12000;
const AUDIO_EXTENSIONS = new Set([
    "ogg", "mp3", "wav", "m4a", "mp4", "webm", "aac", "flac"
]);
const MAX_AUDIO_ATTACHMENTS = parseInt(process.env.MAX_AUDIO_ATTACHMENTS || "1", 10);
function hasTextExtension(filename) {
    if (!filename)
        return false;
    const dot = filename.lastIndexOf(".");
    if (dot === -1)
        return false;
    const ext = filename.slice(dot + 1).toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
}
function isTextAttachment(att) {
    const contentType = att.contentType?.toLowerCase() ?? "";
    if (contentType.startsWith("text/"))
        return true;
    return hasTextExtension(att.name ?? null);
}
function isAudioAttachment(att) {
    const contentType = att.contentType?.toLowerCase() ?? "";
    if (contentType.startsWith("audio/"))
        return true;
    const name = att.name ?? "";
    const dot = name.lastIndexOf(".");
    if (dot === -1)
        return false;
    const ext = name.slice(dot + 1).toLowerCase();
    return AUDIO_EXTENSIONS.has(ext);
}
async function readTextAttachments(message) {
    const parts = [];
    const skipped = [];
    for (const att of message.attachments.values()) {
        if (!isTextAttachment(att)) {
            skipped.push(`${att.name ?? "attachment"} (unsupported type)`);
            continue;
        }
        if ((att.size ?? 0) > MAX_ATTACHMENT_BYTES) {
            skipped.push(`${att.name ?? "attachment"} (too large)`);
            continue;
        }
        try {
            const res = await fetch(att.url);
            if (!res.ok) {
                skipped.push(`${att.name ?? "attachment"} (fetch failed)`);
                continue;
            }
            let text = await res.text();
            let truncated = false;
            if (text.length > MAX_ATTACHMENT_CHARS) {
                text = text.slice(0, MAX_ATTACHMENT_CHARS);
                truncated = true;
            }
            parts.push(`[Attachment: ${att.name ?? "file"}${truncated ? " (truncated)" : ""}]\n` +
                "```\n" + text + "\n```");
        }
        catch (err) {
            skipped.push(`${att.name ?? "attachment"} (read failed)`);
        }
    }
    return {
        text: parts.join("\n\n"),
        skipped,
    };
}
async function transcribeAudioAttachments(message) {
    const transcripts = [];
    let processed = 0;
    for (const att of message.attachments.values()) {
        if (processed >= MAX_AUDIO_ATTACHMENTS)
            break;
        if (!isAudioAttachment(att))
            continue;
        try {
            const text = await (0, whisper_js_1.transcribeAudioFromUrl)(att.url, att.name ?? "voice-note.ogg", att.contentType ?? undefined);
            if (text) {
                transcripts.push(text);
                processed += 1;
            }
        }
        catch {
            continue;
        }
    }
    return transcripts;
}
function parseManualMemoryCommand(text) {
    const match = text.match(/^(?:save\s+to\s+ltm|ltm(?:\s*save)?|remember\s+to\s+ltm)\s*(?:[:\-]\s*|\s+)(.+)$/i);
    if (!match)
        return null;
    const payload = match[1].trim();
    if (!payload)
        return null;
    const segments = payload.split("|").map((s) => s.trim());
    const summary = segments.shift();
    if (!summary)
        return null;
    let type;
    let tags;
    for (const seg of segments) {
        const lower = seg.toLowerCase();
        if (lower.startsWith("type")) {
            const [, rest] = seg.split(/type\s*[:=]/i);
            if (rest?.trim())
                type = rest.trim();
        }
        if (lower.startsWith("tags")) {
            const [, rest] = seg.split(/tags\s*[:=]/i);
            if (rest?.trim()) {
                tags = rest
                    .split(/[,;]/)
                    .map((t) => t.trim())
                    .filter(Boolean);
            }
        }
    }
    return { summary, type, tags };
}
function normalizeToolCalls(parsed) {
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const calls = [];
    for (const item of items) {
        if (!item || typeof item !== "object")
            continue;
        const name = item.tool || item.name;
        if (!name || typeof name !== "string")
            continue;
        const args = typeof item.arguments === "object" && item.arguments !== null
            ? item.arguments
            : typeof item.parameters === "object" && item.parameters !== null
                ? item.parameters
                : typeof item.args === "object" && item.args !== null
                    ? item.args
                    : {};
        calls.push({
            id: item.id,
            name,
            arguments: args,
        });
    }
    return calls;
}
function extractToolCalls(text) {
    if (!text)
        return [];
    const calls = [];
    const blockRegex = /```json\s*([\s\S]*?)```/gi;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const raw = match[1]?.trim();
        if (!raw)
            continue;
        try {
            const parsed = JSON.parse(raw);
            calls.push(...normalizeToolCalls(parsed));
        }
        catch {
            continue;
        }
    }
    if (calls.length > 0)
        return calls;
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            calls.push(...normalizeToolCalls(parsed));
        }
        catch {
            return [];
        }
    }
    return calls;
}
function formatToolResults(results) {
    return results
        .map((r) => {
        const status = r.success ? "ok" : "error";
        return `Tool ${r.tool_name} (${status})\n${r.result}`;
    })
        .join("\n\n");
}
function createBootSummary(humanBlocks, personaBlocks, archivalMemories) {
    const timestamp = new Date().toISOString();
    const humanSummary = humanBlocks
        .slice(0, 5)
        .map(b => `- ${b.label}: ${b.content.slice(0, 100)}...`)
        .join("\n");
    const personaSummary = personaBlocks
        .slice(0, 5)
        .map(b => `- ${b.label}: ${b.content.slice(0, 100)}...`)
        .join("\n");
    const archivalSummary = archivalMemories
        .slice(0, 3)
        .map(m => `- ${m.content.slice(0, 100)}...`)
        .join("\n");
    return `Boot Context Refresh - ${timestamp}

Identity Context Loaded:

About User (${humanBlocks.length} blocks):
${humanSummary}

About Self (${personaBlocks.length} blocks):
${personaSummary}

Recent History (${archivalMemories.length} memories):
${archivalSummary}

System Note: Full context established for this session.`;
}
async function handleMessage(message, options = {}) {
    const sendReply = options.sendReply !== false;
    const baseText = options.overrideText ?? message.content?.trim() ?? "";
    const includeAttachments = options.includeAttachments !== false;
    const { text: attachmentText, skipped } = includeAttachments
        ? await readTextAttachments(message)
        : { text: "", skipped: [] };
    const audioTranscripts = includeAttachments
        ? await transcribeAudioAttachments(message)
        : [];
    const audioText = audioTranscripts.length > 0
        ? audioTranscripts
            .map((t, i) => `[Voice Note ${i + 1} Transcript]\n${t}`)
            .join("\n\n")
        : "";
    const userText = [baseText, attachmentText, audioText]
        .filter(Boolean)
        .join("\n\n");
    if (!userText) {
        if (message.attachments.size > 0) {
            const notice = skipped.length > 0
                ? `I can read text files only (.txt, .md, .json, .csv, .log, .yaml). Skipped: ${skipped.join(", ")}`
                : "I couldn't read those attachments. Try a text-based file like .txt or .md.";
            if (sendReply) {
                await (0, sendLargeMessage_js_1.sendLargeMessage)(message, notice);
            }
            (0, memorySystem_js_1.addToSTM)("assistant", notice);
            return notice;
        }
        return null;
    }
    if (index_js_1.bodySystem) {
        index_js_1.bodySystem.applyText(userText);
    }
    const userId = message.author.id;
    logger_js_1.logger.info(`📩 Message received from ${message.author.tag} (${userId})`);
    // Load user memory lazily
    await (0, memoryStore_js_1.loadLTM)(userId);
    await (0, memoryStore_js_1.loadTraits)(userId);
    // Snapshot STM before this turn so the prompt doesn't repeat Sin's fresh message
    const historyBeforeUser = (0, memorySystem_js_1.getSTM)();
    (0, memorySystem_js_1.addToSTM)("user", userText);
    // Manual LTM command
    const manual = parseManualMemoryCommand(userText);
    if (manual) {
        try {
            const entry = await (0, memorySystem_js_1.addManualMemory)(userId, manual);
            const ack = `🔒 Locked to LTM: ${entry.summary}` +
                (entry.type ? ` (type: ${entry.type})` : "") +
                (entry.tags?.length ? ` [tags: ${entry.tags.join(", ")}]` : "");
            if (sendReply) {
                await (0, sendLargeMessage_js_1.sendLargeMessage)(message, ack);
            }
            (0, memorySystem_js_1.addToSTM)("assistant", ack);
            await (0, memorySystem_js_1.maybeDistill)(userId);
            return ack;
        }
        catch (err) {
            logger_js_1.logger.error("Failed manual LTM save:", err);
            const fail = "I couldn't write that to LTM. Try again in a moment.";
            if (sendReply) {
                await (0, sendLargeMessage_js_1.sendLargeMessage)(message, fail);
            }
            (0, memorySystem_js_1.addToSTM)("assistant", fail);
            return fail;
        }
    }
    // Memory recall - search across all memory types
    // On first message after boot: load full context to establish identity and history
    // On subsequent messages: use lightweight relevance-based recall
    const isBootRefresh = needsBootRefresh;
    const archivalLimit = isBootRefresh ? 15 : 6; // Boot: key history, Regular: recent relevant
    const humanBlockLimit = isBootRefresh ? 12 : 3; // Boot: core identity, Regular: relevant facts
    const personaBlockLimit = isBootRefresh ? 12 : 3; // Boot: core identity, Regular: relevant traits
    const [relevant, archivalMemories, humanBlocks, personaBlocks] = await Promise.all([
        (0, memorySystem_js_1.recallRelevantMemories)(userId, userText),
        (0, blockMemory_js_1.searchArchivalMemories)(userText, archivalLimit),
        (0, blockMemory_js_1.searchHumanBlocks)(userText, humanBlockLimit, isBootRefresh), // Boot: skip relevance filter
        (0, blockMemory_js_1.searchPersonaBlocks)(userText, personaBlockLimit, isBootRefresh), // Boot: skip relevance filter
    ]);
    // Mark boot refresh as complete after first message
    if (isBootRefresh) {
        needsBootRefresh = false;
        logger_js_1.logger.info(`🔄 Boot refresh complete: loaded ${archivalMemories.length} archival, ${humanBlocks.length} human blocks, ${personaBlocks.length} persona blocks`);
        // Create a boot summary as an archival memory
        const bootSummary = createBootSummary(humanBlocks, personaBlocks, archivalMemories);
        try {
            const { upsertArchivalMemories } = await Promise.resolve().then(() => __importStar(require("../memory/memoryDb.js")));
            await upsertArchivalMemories([{
                    id: `boot-${Date.now()}`,
                    content: bootSummary,
                    category: "system",
                    importance: 7,
                    timestamp: Date.now() / 1000,
                    tags: ["boot", "identity", "context-refresh"],
                    metadata: {
                        type: "boot_summary",
                        human_blocks: humanBlocks.length,
                        persona_blocks: personaBlocks.length,
                        archival_count: archivalMemories.length
                    }
                }]);
            logger_js_1.logger.info(`📝 Boot summary committed to archival memory`);
        }
        catch (err) {
            logger_js_1.logger.warn(`Failed to commit boot summary:`, err);
        }
    }
    if (process.env.MEMORY_DEBUG === "true") {
        logger_js_1.logger.info(`🧠 Memory recall: relevant=${relevant.length}, archival=${archivalMemories.length}, human=${humanBlocks.length}, persona=${personaBlocks.length}`);
    }
    const isDm = !message.guildId;
    const voiceTargetHint = isDm
        ? `If you call send_voice_message, use target_type="user" and target="${message.author.id}".`
        : `If you call send_voice_message, use target_type="channel" and target="${message.channel.id}".`;
    // Category-based prompt detection
    let categoryPromptModifications;
    if (message.channel && "parentId" in message.channel && message.channel.parentId) {
        const categoryId = message.channel.parentId;
        try {
            const categoryConfig = await (0, memoryDb_js_1.getCategoryPrompt)(categoryId);
            if (categoryConfig && categoryConfig.enabled) {
                categoryPromptModifications = categoryConfig.prompt_modifications;
                logger_js_1.logger.info(`📂 Using category prompt for category: ${categoryConfig.category_name || categoryId}`);
            }
        }
        catch (err) {
            logger_js_1.logger.warn(`Failed to fetch category prompt for ${categoryId}:`, err);
        }
    }
    const packet = {
        userText,
        stm: historyBeforeUser,
        ltm: (0, memorySystem_js_1.getLTM)(userId),
        traits: (0, memorySystem_js_1.getTraits)(userId),
        relevant,
        archivalMemories,
        humanBlocks,
        personaBlocks,
        conversationContext: options.conversationContext ?? undefined,
        voiceNoteCount: audioTranscripts.length,
        voiceTargetHint,
        authorId: message.author.id,
        authorName: message.author.id, // ← Use ID instead of username
        categoryPromptModifications,
    };
    try {
        let { reply } = await (0, brain_js_1.think)(packet);
        let finalReply = reply || "";
        if (options.allowTools !== false && reply) {
            const toolCalls = extractToolCalls(reply);
            if (toolCalls.length > 0) {
                logger_js_1.logger.info(`🔧 Extracted ${toolCalls.length} tool call(s): ${toolCalls.map(t => t.name).join(', ')}`);
                const results = await executor_js_1.toolExecutor.executeTools(toolCalls);
                logger_js_1.logger.info(`🔧 Tool execution results: ${results.map(r => r.success ? '✅' : '❌').join(' ')}`);
                const toolResults = formatToolResults(results);
                const toolPacket = { ...packet, toolResults };
                const followUp = await (0, brain_js_1.think)(toolPacket);
                logger_js_1.logger.info(`🔧 Follow-up reply length: ${followUp.reply?.length || 0} chars`);
                finalReply = followUp.reply || "";
                // If followUp is empty, strip the JSON tool call from the original reply
                if (!finalReply && reply) {
                    finalReply = reply.replace(/```json\s*[\s\S]*?```/gi, "").trim();
                    // Also strip raw JSON at start of message
                    if (finalReply.startsWith("{") || finalReply.startsWith("[")) {
                        const lines = finalReply.split("\n");
                        // Try to find where JSON ends and regular text begins
                        let jsonEndIndex = 0;
                        let braceCount = 0;
                        let inJson = false;
                        for (let i = 0; i < finalReply.length; i++) {
                            const char = finalReply[i];
                            if (char === "{" || char === "[") {
                                inJson = true;
                                braceCount++;
                            }
                            else if (char === "}" || char === "]") {
                                braceCount--;
                                if (braceCount === 0 && inJson) {
                                    jsonEndIndex = i + 1;
                                    break;
                                }
                            }
                        }
                        if (jsonEndIndex > 0) {
                            finalReply = finalReply.substring(jsonEndIndex).trim();
                        }
                    }
                }
            }
        }
        if (finalReply) {
            // CRITICAL: Strip any remaining JSON tool calls before sending to Discord
            // This is a safety net in case tool execution fails or LLM includes JSON in follow-up
            finalReply = finalReply.replace(/```json\s*[\s\S]*?```/gi, "").trim();
            // Also strip raw JSON objects at the start
            if (finalReply.startsWith("{") || finalReply.startsWith("[")) {
                // Find where JSON ends using brace counting
                let braceCount = 0;
                let inJson = false;
                for (let i = 0; i < finalReply.length; i++) {
                    const char = finalReply[i];
                    if (char === "{" || char === "[") {
                        inJson = true;
                        braceCount++;
                    }
                    else if (char === "}" || char === "]") {
                        braceCount--;
                        if (braceCount === 0 && inJson) {
                            finalReply = finalReply.substring(i + 1).trim();
                            break;
                        }
                    }
                }
            }
            if (sendReply && finalReply) {
                await (0, sendLargeMessage_js_1.sendLargeMessage)(message, finalReply);
            }
            if (finalReply) {
                (0, memorySystem_js_1.addToSTM)("assistant", finalReply);
            }
            // Check for new memories and notify
            const newMemories = await (0, memorySystem_js_1.maybeDistill)(userId);
            if (newMemories.length > 0) {
                const memoryNotification = newMemories
                    .map(m => `  • ${m.summary}`)
                    .join("\n");
                logger_js_1.logger.info(`💾 Memories anchored (${newMemories.length}):\n${memoryNotification}`);
            }
        }
        return finalReply || null;
    }
    catch (err) {
        logger_js_1.logger.error("Brain error:", err);
        return "Something glitched in my head for a second. Can you say that again?";
    }
}
