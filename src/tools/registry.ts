//--------------------------------------------------------------
// FILE: src/tools/registry.ts
// Tool Registry - loads all available tools from tools/ directory
// Ash-move-in: reload + diagnostics + deterministic loading
//--------------------------------------------------------------

import fs from "fs";
import path from "path";
import { ToolDefinition } from "./types.js";
import { logger } from "../utils/logger.js";

const TOOLS_DIR = path.join(process.cwd(), "tools");

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private diagnostics: string[] = [];
  private lastLoad: Date | null = null;

  constructor() {
    this.loadTools();
  }

  /**
   * Deterministically (re)loads tools from the tools directory.
   * - clears old state
   * - records diagnostics (missing script, missing description, bad schema)
   * - never throws (keeps the bot alive)
   */
  private loadTools() {
    this.tools.clear();
    this.diagnostics = [];

    try {
      if (!fs.existsSync(TOOLS_DIR)) {
        const msg = `Tools directory not found: ${TOOLS_DIR}`;
        logger.warn(`⚠️  ${msg}`);
        this.diagnostics.push(msg);
        this.lastLoad = new Date();
        return;
      }

      const files = fs.readdirSync(TOOLS_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const toolPath = path.join(TOOLS_DIR, file);
          const raw = fs.readFileSync(toolPath, "utf-8");
          const toolData = JSON.parse(raw);

          const toolName: string = toolData.name || file.replace(".json", "");
          const pythonScript = path.join(TOOLS_DIR, `${toolName}.py`);

          const tool: ToolDefinition = {
            name: toolName,
            description: toolData.description || "",
            parameters: toolData.parameters || { type: "object", properties: {} },
            pythonScript: fs.existsSync(pythonScript) ? pythonScript : undefined,
          };

          // Soft diagnostics (won't prevent loading)
          if (!tool.description) {
            this.diagnostics.push(`Tool "${toolName}" is missing a description.`);
          }
          if (!tool.parameters || typeof tool.parameters !== "object") {
            this.diagnostics.push(`Tool "${toolName}" has invalid parameters schema (not an object).`);
          } else if (!tool.parameters.properties || typeof tool.parameters.properties !== "object") {
            this.diagnostics.push(`Tool "${toolName}" is missing parameters.properties.`);
          }
          if (!tool.pythonScript) {
            this.diagnostics.push(`Tool "${toolName}" has no Python script (${toolName}.py not found).`);
          }

          this.tools.set(toolName, tool);
          logger.info(`🔧 Loaded tool: ${toolName}`);
        } catch (err: any) {
          logger.error(`Failed to load tool ${file}:`, err);
          this.diagnostics.push(`Failed to load "${file}": ${err?.message || String(err)}`);
        }
      }

      this.lastLoad = new Date();
      logger.info(`✅ Loaded ${this.tools.size} tools from ${TOOLS_DIR}`);

      if (this.diagnostics.length > 0) {
        logger.warn(`⚠️  Tool diagnostics:\n  - ${this.diagnostics.join("\n  - ")}`);
      }
    } catch (err: any) {
      logger.error("Failed to load tools:", err);
      this.diagnostics.push(`Registry load failed: ${err?.message || String(err)}`);
      this.lastLoad = new Date();
    }
  }

  /** Reload tools without restarting the bot. */
  reload() {
    logger.info("🔄 Reloading tools registry");
    this.loadTools();
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Useful for a debug command (or startup banner). */
  getDiagnostics(): string[] {
    return [...this.diagnostics];
  }

  getLastLoad(): Date | null {
    return this.lastLoad;
  }

  // Get tool definitions in OpenAI function calling format
  getToolsForPrompt(): any[] {
    return this.getAllTools().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // Get tool definitions as plain text for prompt injection
  getToolsAsText(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return "";

    let text = "# Available Tools\n\n";
    text +=
      "You have access to the following tools. When you need to use a tool, output a JSON block with this format:\n\n";
    text +=
      '```json\n{\n  "tool": "tool_name",\n  "arguments": { "arg1": "value1" }\n}\n```\n\n';
    text += "## Tools:\n\n";

    for (const tool of tools) {
      text += `### ${tool.name}\n`;
      text += `${tool.description}\n\n`;

      if (tool.parameters?.properties) {
        text += "**Parameters:**\n";
        for (const [param, schema] of Object.entries(tool.parameters.properties)) {
          const required = tool.parameters.required?.includes(param) ? " (required)" : "";
          const type = (schema as any).type || "any";
          const desc = (schema as any).description || "";
          text += `- \`${param}\` (${type})${required}: ${desc}\n`;
        }
        text += "\n";
      }

      if (!tool.pythonScript) {
        text += "*No Python script attached*\n\n";
      }
    }

    return text;
  }
}

// Global singleton
export const toolRegistry = new ToolRegistry();
