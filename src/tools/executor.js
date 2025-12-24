"use strict";
//--------------------------------------------------------------
// FILE: src/tools/executor.ts
// Tool Executor - executes Python tool scripts
// Ash-move-in: safe spawn (no shell quoting), optional retry,
//              debug dumps, post-execution hooks
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolExecutor = exports.ToolExecutor = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const registry_js_1 = require("./registry.js");
const logger_js_1 = require("../utils/logger.js");
const restSendVoice_js_1 = require("../discord/restSendVoice.js");
const webSearchService_js_1 = require("../services/webSearchService.js");
function ensureToolCallId(toolCall) {
    return toolCall.id ?? (0, crypto_1.randomUUID)();
}
function shouldRetry() {
    return (process.env.TOOL_RETRY || "").toLowerCase() === "true";
}
function debugEnabled() {
    return (process.env.DEBUG || "").toLowerCase() === "true";
}
function needsReason(toolName) {
    return toolName.startsWith("memory_") ||
        toolName.startsWith("core_memory_") ||
        toolName.startsWith("archival_memory_");
}
function needsIntent(toolName) {
    return toolName === "send_voice_message" ||
        toolName === "discord_tool" ||
        toolName === "rider_pi_tool";
}
class ToolExecutor {
    constructor() {
        this.hooks = [];
    }
    addHook(fn) {
        this.hooks.push(fn);
    }
    async executeTool(toolCall) {
        const toolCallId = ensureToolCallId(toolCall);
        const tool = registry_js_1.toolRegistry.getTool(toolCall.name);
        const args = toolCall.arguments ?? {};
        logger_js_1.logger.debug(`[ToolExecutor] Executing ${toolCall.name} with args: ${JSON.stringify(args).substring(0, 200)}`);
        if (needsReason(toolCall.name) && typeof args.reason !== "string") {
            logger_js_1.logger.warn(`[ToolExecutor] ${toolCall.name} missing required field: reason`);
            return { tool_call_id: toolCall.id, tool_name: toolCall.name, success: false,
                result: "Missing required field: reason", error: "Missing reason" };
        }
        // Make intent optional for send_voice_message (it's just for context/logging)
        // Other tools that need intent (discord_tool, rider_pi_tool) should still require it
        if (needsIntent(toolCall.name) && toolCall.name !== "send_voice_message" && typeof args.intent !== "string") {
            logger_js_1.logger.warn(`[ToolExecutor] ${toolCall.name} missing required field: intent (got type: ${typeof args.intent})`);
            return { tool_call_id: toolCall.id, tool_name: toolCall.name, success: false,
                result: "Missing required field: intent", error: "Missing intent" };
        }
        if (!tool) {
            return {
                tool_call_id: toolCallId,
                tool_name: toolCall.name,
                result: `Error: Tool '${toolCall.name}' not found`,
                success: false,
                error: `Tool not found: ${toolCall.name}`,
            };
        }
        let result;
        // Prefer built-in JS implementation for certain tools (Railway has no python3)
        if (toolCall.name === "send_voice_message" || toolCall.name === "web_search") {
            result = await this.executeBuiltInTool({ ...toolCall, id: toolCallId });
        }
        else if (tool.pythonScript) {
            // If tool has Python script, execute it
            let attempt = 1;
            result = await this.executePythonTool({ ...toolCall, id: toolCallId }, tool.pythonScript, attempt);
            // Optional single retry
            if (!result.success && shouldRetry()) {
                attempt = 2;
                logger_js_1.logger.warn(`⚠️  Retrying tool ${toolCall.name} (attempt ${attempt})`);
                result = await this.executePythonTool({ ...toolCall, id: toolCallId }, tool.pythonScript, attempt);
            }
        }
        else {
            // If no Python script, handle built-in tools
            result = await this.executeBuiltInTool({ ...toolCall, id: toolCallId });
        }
        await this.runHooks({ ...toolCall, id: toolCallId }, result);
        return result;
    }
    async executePythonTool(toolCall, scriptPath, attempt) {
        const toolCallId = ensureToolCallId(toolCall);
        try {
            logger_js_1.logger.info(`🔧 Executing Python tool: ${toolCall.name} (attempt ${attempt})`);
            const argsJson = JSON.stringify(toolCall.arguments ?? {});
            const { stdout, stderr, exitCode, signal } = await this.spawnPython(scriptPath, argsJson, 60000);
            if (stderr && !/warning/i.test(stderr)) {
                logger_js_1.logger.warn(`⚠️  Tool ${toolCall.name} stderr:`, stderr);
            }
            if (debugEnabled()) {
                this.debugDump(toolCall, scriptPath, argsJson, stdout, stderr, exitCode, signal, attempt);
            }
            if (exitCode !== 0) {
                const msg = `Tool exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`;
                logger_js_1.logger.error(`❌ Tool ${toolCall.name} failed: ${msg}`);
                return {
                    tool_call_id: toolCallId,
                    tool_name: toolCall.name,
                    result: `Error executing tool: ${msg}`,
                    success: false,
                    error: msg,
                };
            }
            logger_js_1.logger.info(`✅ Tool ${toolCall.name} completed`);
            return {
                tool_call_id: toolCallId,
                tool_name: toolCall.name,
                result: stdout.trim(),
                success: true,
            };
        }
        catch (err) {
            logger_js_1.logger.error(`❌ Tool ${toolCall.name} failed:`, err);
            if (debugEnabled()) {
                this.debugDump(toolCall, scriptPath, JSON.stringify(toolCall.arguments ?? {}), "", err?.message || String(err), -1, null, attempt);
            }
            return {
                tool_call_id: toolCallId,
                tool_name: toolCall.name,
                result: `Error executing tool: ${err.message}`,
                success: false,
                error: err.message,
            };
        }
    }
    spawnPython(scriptPath, argsJson, timeoutMs) {
        return new Promise((resolve, reject) => {
            // No shell = no quoting bugs. Python sees argv[1] as the JSON string.
            const child = (0, child_process_1.spawn)("python3", [scriptPath, argsJson], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            const killTimer = setTimeout(() => {
                child.kill("SIGKILL");
            }, timeoutMs);
            child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
            child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));
            child.on("error", (err) => {
                clearTimeout(killTimer);
                reject(err);
            });
            child.on("close", (code, signal) => {
                clearTimeout(killTimer);
                resolve({
                    stdout,
                    stderr,
                    exitCode: typeof code === "number" ? code : -1,
                    signal,
                });
            });
        });
    }
    async executeBuiltInTool(toolCall) {
        const toolCallId = ensureToolCallId(toolCall);
        switch (toolCall.name) {
            case "send_voice_message": {
                try {
                    logger_js_1.logger.info(`🎤 Executing send_voice_message tool`);
                    logger_js_1.logger.debug(`[Tool] Voice message args: ${JSON.stringify(toolCall.arguments)}`);
                    const result = await (0, restSendVoice_js_1.sendVoiceMessageViaRest)(toolCall.arguments);
                    const isSuccess = !result.toLowerCase().startsWith("error");
                    if (isSuccess) {
                        logger_js_1.logger.info(`✅ send_voice_message completed: ${result}`);
                    }
                    else {
                        logger_js_1.logger.error(`❌ send_voice_message failed: ${result}`);
                    }
                    return {
                        tool_call_id: toolCallId,
                        tool_name: toolCall.name,
                        result,
                        success: isSuccess,
                    };
                }
                catch (err) {
                    logger_js_1.logger.error(`❌ send_voice_message threw exception: ${err.message || String(err)}`);
                    return {
                        tool_call_id: toolCallId,
                        tool_name: toolCall.name,
                        result: `Error executing tool: ${err.message || String(err)}`,
                        success: false,
                        error: err.message || String(err),
                    };
                }
            }
            case "web_search": {
                try {
                    logger_js_1.logger.info(`🔍 Executing web_search tool`);
                    const apiKey = process.env.EXA_API_KEY || "";
                    if (!apiKey) {
                        logger_js_1.logger.error("[WebSearch] EXA_API_KEY is not set!");
                        return {
                            tool_call_id: toolCallId,
                            tool_name: toolCall.name,
                            result: "Error: EXA_API_KEY is not set.",
                            success: false,
                            error: "Missing API key",
                        };
                    }
                    const searchService = new webSearchService_js_1.WebSearchService(apiKey);
                    const searchResult = await searchService.search(toolCall.arguments);
                    if (!searchResult.success) {
                        logger_js_1.logger.error(`❌ web_search failed: ${searchResult.error}`);
                        return {
                            tool_call_id: toolCallId,
                            tool_name: toolCall.name,
                            result: `Error: ${searchResult.error}`,
                            success: false,
                            error: searchResult.error,
                        };
                    }
                    // Format results as JSON string
                    const formattedResults = JSON.stringify(searchResult.results, null, 2);
                    logger_js_1.logger.info(`✅ web_search completed: ${searchResult.results?.length || 0} results`);
                    return {
                        tool_call_id: toolCallId,
                        tool_name: toolCall.name,
                        result: formattedResults,
                        success: true,
                    };
                }
                catch (err) {
                    logger_js_1.logger.error(`❌ web_search threw exception: ${err.message || String(err)}`);
                    return {
                        tool_call_id: toolCallId,
                        tool_name: toolCall.name,
                        result: `Error executing tool: ${err.message || String(err)}`,
                        success: false,
                        error: err.message || String(err),
                    };
                }
            }
            case "conversation_search":
            case "archival_memory_search":
                return {
                    tool_call_id: toolCallId,
                    tool_name: toolCall.name,
                    result: "Built-in tool not yet implemented",
                    success: false,
                    error: "Not implemented",
                };
            default:
                return {
                    tool_call_id: toolCallId,
                    tool_name: toolCall.name,
                    result: `Unknown built-in tool: ${toolCall.name}`,
                    success: false,
                    error: "Unknown tool",
                };
        }
    }
    async executeTools(toolCalls) {
        const results = [];
        for (const toolCall of toolCalls) {
            results.push(await this.executeTool(toolCall));
        }
        return results;
    }
    async runHooks(toolCall, result) {
        if (this.hooks.length === 0)
            return;
        for (const hook of this.hooks) {
            try {
                await hook(toolCall, result);
            }
            catch (e) {
                logger_js_1.logger.warn(`⚠️  ToolExecutor hook failed:`, e);
            }
        }
    }
    debugDump(toolCall, scriptPath, argsJson, stdout, stderr, exitCode, signal, attempt) {
        try {
            const dir = path_1.default.join(process.cwd(), "debug", "tools");
            fs_1.default.mkdirSync(dir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const file = path_1.default.join(dir, `tool_${toolCall.name}_${ts}_attempt${attempt}.log`);
            const dump = [
                `=== TOOL CALL: ${toolCall.name} @ ${ts} (attempt ${attempt}) ===`,
                `tool_call_id: ${toolCall.id}`,
                `script: ${scriptPath}`,
                `exitCode: ${exitCode}`,
                `signal: ${signal ?? ""}`,
                ``,
                `--- ARGUMENTS JSON ---`,
                argsJson,
                ``,
                `--- STDOUT ---`,
                stdout,
                ``,
                `--- STDERR ---`,
                stderr,
                ``,
            ].join("\n");
            fs_1.default.writeFileSync(file, dump, "utf-8");
        }
        catch (e) {
            logger_js_1.logger.warn("Failed to write tool debug dump:", e);
        }
    }
}
exports.ToolExecutor = ToolExecutor;
// Global singleton
exports.toolExecutor = new ToolExecutor();
