//--------------------------------------------------------------
// FILE: src/tools/types.ts
// Tool System Types - for unified Ollama + Tool execution
//--------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  pythonScript?: string; // Path to Python implementation
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id?: string;
  tool_name: string;
  result: string;
  success: boolean;
  error?: string;
}

export interface BrainWithTools {
  reply: string;
  toolCalls?: ToolCall[];
  reasoning?: string[];
}
