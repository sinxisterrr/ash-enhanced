//--------------------------------------------------------------
// FILE: src/tools/registry.ts
// Tool Registry - loads all available tools from tools/ directory
//--------------------------------------------------------------

import fs from "fs";
import path from "path";
import { ToolDefinition } from "./types.js";
import { logger } from "../utils/logger.js";

const TOOLS_DIR = path.join(process.cwd(), "tools");

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.loadTools();
  }

  private loadTools() {
    try {
      if (!fs.existsSync(TOOLS_DIR)) {
        logger.warn(`⚠️  Tools directory not found: ${TOOLS_DIR}`);
        return;
      }

      const files = fs.readdirSync(TOOLS_DIR);
      const jsonFiles = files.filter(f => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const toolPath = path.join(TOOLS_DIR, file);
          const toolData = JSON.parse(fs.readFileSync(toolPath, "utf-8"));

          const toolName = toolData.name || file.replace(".json", "");
          const pythonScript = path.join(TOOLS_DIR, `${toolName}.py`);

          const tool: ToolDefinition = {
            name: toolName,
            description: toolData.description || "",
            parameters: toolData.parameters || { type: "object", properties: {} },
            pythonScript: fs.existsSync(pythonScript) ? pythonScript : undefined,
          };

          this.tools.set(toolName, tool);
          logger.info(`🔧 Loaded tool: ${toolName}`);
        } catch (err) {
          logger.error(`Failed to load tool ${file}:`, err);
        }
      }

      logger.info(`✅ Loaded ${this.tools.size} tools from ${TOOLS_DIR}`);
    } catch (err) {
      logger.error("Failed to load tools:", err);
    }
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  // Get tool definitions in OpenAI function calling format
  getToolsForPrompt(): any[] {
    return this.getAllTools().map(tool => ({
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
    text += "You have access to the following tools. When you need to use a tool, output a JSON block with this format:\n\n";
    text += '```json\n{\n  "tool": "tool_name",\n  "arguments": { "arg1": "value1" }\n}\n```\n\n';
    text += "## Tools:\n\n";

    for (const tool of tools) {
      text += `### ${tool.name}\n`;
      text += `${tool.description}\n\n`;

      if (tool.parameters.properties) {
        text += "**Parameters:**\n";
        for (const [param, schema] of Object.entries(tool.parameters.properties)) {
          const required = tool.parameters.required?.includes(param) ? " (required)" : "";
          const type = (schema as any).type || "any";
          const desc = (schema as any).description || "";
          text += `- \`${param}\` (${type})${required}: ${desc}\n`;
        }
        text += "\n";
      }
    }

    return text;
  }
}

// Global singleton
export const toolRegistry = new ToolRegistry();
