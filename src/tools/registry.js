"use strict";
//--------------------------------------------------------------
// FILE: src/tools/registry.ts
// Tool Registry - loads all available tools from tools/ directory
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = exports.ToolRegistry = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("../utils/logger.js");
const TOOLS_DIR = path_1.default.join(process.cwd(), "tools");
class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.loadTools();
    }
    loadTools() {
        try {
            if (!fs_1.default.existsSync(TOOLS_DIR)) {
                logger_js_1.logger.warn(`⚠️  Tools directory not found: ${TOOLS_DIR}`);
                return;
            }
            const files = fs_1.default.readdirSync(TOOLS_DIR);
            const jsonFiles = files.filter(f => f.endsWith(".json"));
            for (const file of jsonFiles) {
                try {
                    const toolPath = path_1.default.join(TOOLS_DIR, file);
                    const toolData = JSON.parse(fs_1.default.readFileSync(toolPath, "utf-8"));
                    const toolName = toolData.name || file.replace(".json", "");
                    const pythonScript = path_1.default.join(TOOLS_DIR, `${toolName}.py`);
                    const tool = {
                        name: toolName,
                        description: toolData.description || "",
                        parameters: toolData.parameters || { type: "object", properties: {} },
                        pythonScript: fs_1.default.existsSync(pythonScript) ? pythonScript : undefined,
                    };
                    this.tools.set(toolName, tool);
                    logger_js_1.logger.info(`🔧 Loaded tool: ${toolName}`);
                }
                catch (err) {
                    logger_js_1.logger.error(`Failed to load tool ${file}:`, err);
                }
            }
            logger_js_1.logger.info(`✅ Loaded ${this.tools.size} tools from ${TOOLS_DIR}`);
        }
        catch (err) {
            logger_js_1.logger.error("Failed to load tools:", err);
        }
    }
    getAllTools() {
        return Array.from(this.tools.values());
    }
    getTool(name) {
        return this.tools.get(name);
    }
    // Get tool definitions in OpenAI function calling format
    getToolsForPrompt() {
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
    getToolsAsText() {
        const tools = this.getAllTools();
        if (tools.length === 0)
            return "";
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
                    const type = schema.type || "any";
                    const desc = schema.description || "";
                    text += `- \`${param}\` (${type})${required}: ${desc}\n`;
                }
                text += "\n";
            }
        }
        return text;
    }
}
exports.ToolRegistry = ToolRegistry;
// Global singleton
exports.toolRegistry = new ToolRegistry();
