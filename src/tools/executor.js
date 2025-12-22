"use strict";
//--------------------------------------------------------------
// FILE: src/tools/executor.ts
// Tool Executor - executes Python tool scripts
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolExecutor = exports.ToolExecutor = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const registry_js_1 = require("./registry.js");
const logger_js_1 = require("../utils/logger.js");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ToolExecutor {
    async executeTool(toolCall) {
        const tool = registry_js_1.toolRegistry.getTool(toolCall.name);
        if (!tool) {
            return {
                tool_call_id: toolCall.id,
                tool_name: toolCall.name,
                result: `Error: Tool '${toolCall.name}' not found`,
                success: false,
                error: `Tool not found: ${toolCall.name}`,
            };
        }
        // If tool has Python script, execute it
        if (tool.pythonScript) {
            return await this.executePythonTool(toolCall, tool.pythonScript);
        }
        // If no Python script, handle built-in tools
        return await this.executeBuiltInTool(toolCall);
    }
    async executePythonTool(toolCall, scriptPath) {
        try {
            logger_js_1.logger.info(`🔧 Executing Python tool: ${toolCall.name}`);
            // Prepare arguments as JSON string
            const argsJson = JSON.stringify(toolCall.arguments);
            const escapedArgs = argsJson.replace(/"/g, '\\"');
            // Execute Python script with arguments
            const command = `python3 "${scriptPath}" '${argsJson}'`;
            const { stdout, stderr } = await execAsync(command, {
                timeout: 60000, // 60 second timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });
            if (stderr && !stderr.includes("warning")) {
                logger_js_1.logger.warn(`⚠️  Tool ${toolCall.name} stderr:`, stderr);
            }
            const result = stdout.trim();
            logger_js_1.logger.info(`✅ Tool ${toolCall.name} completed`);
            return {
                tool_call_id: toolCall.id,
                tool_name: toolCall.name,
                result,
                success: true,
            };
        }
        catch (err) {
            logger_js_1.logger.error(`❌ Tool ${toolCall.name} failed:`, err);
            return {
                tool_call_id: toolCall.id,
                tool_name: toolCall.name,
                result: `Error executing tool: ${err.message}`,
                success: false,
                error: err.message,
            };
        }
    }
    async executeBuiltInTool(toolCall) {
        // Handle built-in tools that don't need Python scripts
        // (e.g., memory operations that are handled in TypeScript)
        switch (toolCall.name) {
            case "conversation_search":
            case "archival_memory_search":
                // These could be handled by your memory system
                return {
                    tool_call_id: toolCall.id,
                    tool_name: toolCall.name,
                    result: "Built-in tool not yet implemented",
                    success: false,
                    error: "Not implemented",
                };
            default:
                return {
                    tool_call_id: toolCall.id,
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
            const result = await this.executeTool(toolCall);
            results.push(result);
        }
        return results;
    }
}
exports.ToolExecutor = ToolExecutor;
// Global singleton
exports.toolExecutor = new ToolExecutor();
