import type { Message, StreamCallback, ToolDefinition, ToolCall, ToolResult, TokenUsage } from './types.js';

export interface ModelResponse {
  content: string;
  toolCalls: ToolCall[];
  tokenUsage: TokenUsage;
  stopReason: string;
}

export interface ModelOptions {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onStream?: StreamCallback;
}

export abstract class BaseModel {
  abstract readonly provider: 'anthropic' | 'openai';
  abstract readonly modelId: string;

  abstract chat(options: ModelOptions): Promise<ModelResponse>;

  abstract chatWithToolLoop(
    options: ModelOptions,
    executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>,
  ): Promise<{ response: ModelResponse; allToolCalls: ToolCall[]; allToolResults: ToolResult[] }>;

  abstract validateApiKey(): Promise<boolean>;
}
