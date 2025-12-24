//--------------------------------------------------------------
// FILE: src/tools/executor.ts
// Tool Executor - executes Python tool scripts
// Ash-move-in: safe spawn (no shell quoting), optional retry,
//              debug dumps, post-execution hooks
//--------------------------------------------------------------

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ToolCall, ToolResult } from "./types.js";
import { toolRegistry } from "./registry.js";
import { logger } from "../utils/logger.js";
import { sendVoiceMessageViaRest } from "../discord/restSendVoice.js";
import { WebSearchService } from "../services/webSearchService.js";
import { HeartbeatService } from "../services/heartbeatService.js";
import { SpotifyService } from "../services/spotifyService.js";

type ToolHook = (toolCall: ToolCall, result: ToolResult) => void | Promise<void>;

function ensureToolCallId(toolCall: ToolCall): string {
  return toolCall.id ?? randomUUID();
}

function shouldRetry(): boolean {
  return (process.env.TOOL_RETRY || "").toLowerCase() === "true";
}

function debugEnabled(): boolean {
  return (process.env.DEBUG || "").toLowerCase() === "true";
}

function needsReason(toolName: string) {
  return toolName.startsWith("memory_") ||
    toolName.startsWith("core_memory_") ||
    toolName.startsWith("archival_memory_");
}

function needsIntent(toolName: string) {
  return toolName === "send_voice_message" ||
    toolName === "discord_tool" ||
    toolName === "rider_pi_tool";
}

export class ToolExecutor {
  private hooks: ToolHook[] = [];

  addHook(fn: ToolHook) {
    this.hooks.push(fn);
  }

  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const toolCallId = ensureToolCallId(toolCall);
    const tool = toolRegistry.getTool(toolCall.name);
    const args = toolCall.arguments ?? {};

    logger.debug(`[ToolExecutor] Executing ${toolCall.name} with args: ${JSON.stringify(args).substring(0, 200)}`);

    if (needsReason(toolCall.name) && typeof args.reason !== "string") {
      logger.warn(`[ToolExecutor] ${toolCall.name} missing required field: reason`);
      return { tool_call_id: toolCall.id, tool_name: toolCall.name, success: false,
        result: "Missing required field: reason", error: "Missing reason" };
    }

    // Make intent optional for send_voice_message (it's just for context/logging)
    // Other tools that need intent (discord_tool, rider_pi_tool) should still require it
    if (needsIntent(toolCall.name) && toolCall.name !== "send_voice_message" && typeof args.intent !== "string") {
      logger.warn(`[ToolExecutor] ${toolCall.name} missing required field: intent (got type: ${typeof args.intent})`);
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

    let result: ToolResult;

    // Prefer built-in JS implementation for certain tools (Railway has no python3)
    const builtInTools = ["send_voice_message", "web_search", "send_heartbeat", "spotify_control"];
    if (builtInTools.includes(toolCall.name)) {
      result = await this.executeBuiltInTool({ ...toolCall, id: toolCallId });
    } else if (tool.pythonScript) {
      // If tool has Python script, execute it
      let attempt = 1;
      result = await this.executePythonTool({ ...toolCall, id: toolCallId }, tool.pythonScript, attempt);

      // Optional single retry
      if (!result.success && shouldRetry()) {
        attempt = 2;
        logger.warn(`⚠️  Retrying tool ${toolCall.name} (attempt ${attempt})`);
        result = await this.executePythonTool({ ...toolCall, id: toolCallId }, tool.pythonScript, attempt);
      }
    } else {
      // If no Python script, handle built-in tools
      result = await this.executeBuiltInTool({ ...toolCall, id: toolCallId });
    }

    await this.runHooks({ ...toolCall, id: toolCallId }, result);
    return result;
  }

  private async executePythonTool(toolCall: ToolCall, scriptPath: string, attempt: number): Promise<ToolResult> {
    const toolCallId = ensureToolCallId(toolCall);

    try {
      logger.info(`🔧 Executing Python tool: ${toolCall.name} (attempt ${attempt})`);

      const argsJson = JSON.stringify(toolCall.arguments ?? {});
      const { stdout, stderr, exitCode, signal } = await this.spawnPython(scriptPath, argsJson, 60000);

      if (stderr && !/warning/i.test(stderr)) {
        logger.warn(`⚠️  Tool ${toolCall.name} stderr:`, stderr);
      }

      if (debugEnabled()) {
        this.debugDump(toolCall, scriptPath, argsJson, stdout, stderr, exitCode, signal, attempt);
      }

      if (exitCode !== 0) {
        const msg = `Tool exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`;
        logger.error(`❌ Tool ${toolCall.name} failed: ${msg}`);
        return {
          tool_call_id: toolCallId,
          tool_name: toolCall.name,
          result: `Error executing tool: ${msg}`,
          success: false,
          error: msg,
        };
      }

      logger.info(`✅ Tool ${toolCall.name} completed`);
      return {
        tool_call_id: toolCallId,
        tool_name: toolCall.name,
        result: stdout.trim(),
        success: true,
      };
    } catch (err: any) {
      logger.error(`❌ Tool ${toolCall.name} failed:`, err);

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

  private spawnPython(
    scriptPath: string,
    argsJson: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      // No shell = no quoting bugs. Python sees argv[1] as the JSON string.
      const child = spawn("python3", [scriptPath, argsJson], {
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

  private async executeBuiltInTool(toolCall: ToolCall): Promise<ToolResult> {
    const toolCallId = ensureToolCallId(toolCall);

    switch (toolCall.name) {
      case "send_voice_message": {
        try {
          logger.info(`🎤 Executing send_voice_message tool`);
          logger.debug(`[Tool] Voice message args: ${JSON.stringify(toolCall.arguments)}`);
          const result = await sendVoiceMessageViaRest(
            toolCall.arguments as any
          );
          const isSuccess = !result.toLowerCase().startsWith("error");
          if (isSuccess) {
            logger.info(`✅ send_voice_message completed: ${result}`);
          } else {
            logger.error(`❌ send_voice_message failed: ${result}`);
          }
          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result,
            success: isSuccess,
          };
        } catch (err: any) {
          logger.error(`❌ send_voice_message threw exception: ${err.message || String(err)}`);
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
          logger.info(`🔍 Executing web_search tool`);
          const apiKey = process.env.EXA_API_KEY || "";
          if (!apiKey) {
            logger.error("[WebSearch] EXA_API_KEY is not set!");
            return {
              tool_call_id: toolCallId,
              tool_name: toolCall.name,
              result: "Error: EXA_API_KEY is not set.",
              success: false,
              error: "Missing API key",
            };
          }

          const searchService = new WebSearchService(apiKey);
          const searchResult = await searchService.search(toolCall.arguments as any);

          if (!searchResult.success) {
            logger.error(`❌ web_search failed: ${searchResult.error}`);
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
          logger.info(`✅ web_search completed: ${searchResult.results?.length || 0} results`);

          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result: formattedResults,
            success: true,
          };
        } catch (err: any) {
          logger.error(`❌ web_search threw exception: ${err.message || String(err)}`);
          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result: `Error executing tool: ${err.message || String(err)}`,
            success: false,
            error: err.message || String(err),
          };
        }
      }

      case "send_heartbeat": {
        try {
          logger.info(`💜 Executing send_heartbeat tool`);
          const heartbeatService = new HeartbeatService();
          const result = await heartbeatService.sendHeartbeat(toolCall.arguments as any);

          const isSuccess = !result.toLowerCase().startsWith("error");
          if (isSuccess) {
            logger.info(`✅ send_heartbeat completed: ${result}`);
          } else {
            logger.error(`❌ send_heartbeat failed: ${result}`);
          }

          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result,
            success: isSuccess,
          };
        } catch (err: any) {
          logger.error(`❌ send_heartbeat threw exception: ${err.message || String(err)}`);
          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result: `Error executing tool: ${err.message || String(err)}`,
            success: false,
            error: err.message || String(err),
          };
        }
      }

      case "spotify_control": {
        try {
          logger.info(`🎵 Executing spotify_control tool`);
          const spotify = new SpotifyService();
          const args = toolCall.arguments as any;
          let result = "";

          switch (args.action) {
            case "execute_batch":
              result = await spotify.executeBatch(args.operations || []);
              break;
            case "search":
              const searchResults = await spotify.search(args.query, args.content_type || "track", args.limit || 10);
              result = JSON.stringify(searchResults, null, 2);
              break;
            case "play":
              if (args.query) {
                result = await spotify.searchAndPlay(args.query, args.content_type || "track");
              } else if (args.spotify_id) {
                await spotify.play(`spotify:${args.content_type || "track"}:${args.spotify_id}`);
                result = "Playing";
              }
              break;
            case "pause":
              result = await spotify.pause();
              break;
            case "next":
              result = await spotify.next();
              break;
            case "previous":
              result = await spotify.previous();
              break;
            case "now_playing":
              result = await spotify.getNowPlaying();
              break;
            case "create_playlist":
              if (args.songs) {
                result = await spotify.createPlaylistWithSongs(args.playlist_name, args.songs, args.playlist_description);
              } else {
                const playlist = await spotify.createPlaylist(args.playlist_name, args.playlist_description);
                result = `Created playlist "${playlist.name}"`;
              }
              break;
            case "my_playlists":
              result = await spotify.getMyPlaylists(args.limit || 20);
              break;
            default:
              result = `Unknown action: ${args.action}`;
          }

          logger.info(`✅ spotify_control completed: ${result.substring(0, 100)}`);
          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result,
            success: true,
          };
        } catch (err: any) {
          logger.error(`❌ spotify_control threw exception: ${err.message || String(err)}`);
          return {
            tool_call_id: toolCallId,
            tool_name: toolCall.name,
            result: `Error: ${err.message || String(err)}`,
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
          result: `Tool ${toolCall.name} temporarily unavailable - Python implementation needs TypeScript conversion`,
          success: false,
          error: "Python not available on Railway",
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

  async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const toolCall of toolCalls) {
      results.push(await this.executeTool(toolCall));
    }
    return results;
  }

  private async runHooks(toolCall: ToolCall, result: ToolResult) {
    if (this.hooks.length === 0) return;
    for (const hook of this.hooks) {
      try {
        await hook(toolCall, result);
      } catch (e) {
        logger.warn(`⚠️  ToolExecutor hook failed:`, e);
      }
    }
  }

  private debugDump(
    toolCall: ToolCall,
    scriptPath: string,
    argsJson: string,
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: NodeJS.Signals | null,
    attempt: number
  ) {
    try {
      const dir = path.join(process.cwd(), "debug", "tools");
      fs.mkdirSync(dir, { recursive: true });

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const file = path.join(dir, `tool_${toolCall.name}_${ts}_attempt${attempt}.log`);

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

      fs.writeFileSync(file, dump, "utf-8");
    } catch (e) {
      logger.warn("Failed to write tool debug dump:", e);
    }
  }
}

// Global singleton
export const toolExecutor = new ToolExecutor();
