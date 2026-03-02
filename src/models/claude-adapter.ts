import Anthropic from '@anthropic-ai/sdk';
import { BaseModel, type ModelOptions, type ModelResponse } from './base-model.js';
import type { Message, ToolCall, ToolResult, ToolDefinition } from './types.js';
import { classifyError, withRetry } from '../errors/api-errors.js';
import { logger } from '../utils/logger.js';

/**
 * Max output tokens per model. Fallback 16384 for unknown models.
 */
const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  'claude-opus-4-6':                 32768,
  'claude-sonnet-4-6':               16384,
  'claude-haiku-4-5-20251001':        8192,
  'claude-sonnet-4-20250514':        16384,
  'claude-opus-4-20250514':          32768,
};

const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

export class ClaudeAdapter extends BaseModel {
  readonly provider = 'anthropic' as const;
  readonly modelId: string;
  private client: Anthropic;
  private modelMaxTokens: number;

  constructor(apiKey: string, modelId: string = 'claude-sonnet-4-20250514') {
    super();
    this.modelId = modelId;
    this.client = new Anthropic({ apiKey });
    this.modelMaxTokens = MODEL_MAX_OUTPUT_TOKENS[modelId] ?? DEFAULT_MAX_OUTPUT_TOKENS;
  }

  async chat(options: ModelOptions): Promise<ModelResponse> {
    return withRetry(async () => {
      const messages = this.toAnthropicMessages(options.messages);
      const tools = options.tools ? this.toAnthropicTools(options.tools) : undefined;

      if (options.stream && options.onStream) {
        return this.chatStream(options.systemPrompt, messages, tools, options);
      }

      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: options.maxTokens ?? this.modelMaxTokens,
        temperature: options.temperature ?? 0,
        system: options.systemPrompt,
        messages,
        tools,
      });

      return this.parseResponse(response);
    }, { provider: 'anthropic' });
  }

  async chatWithToolLoop(
    options: ModelOptions,
    executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>,
  ): Promise<{ response: ModelResponse; allToolCalls: ToolCall[]; allToolResults: ToolResult[] }> {
    const allToolCalls: ToolCall[] = [];
    const allToolResults: ToolResult[] = [];
    const messages = [...options.messages];

    let iterations = 0;
    const maxIterations = 30;

    while (iterations < maxIterations) {
      iterations++;
      const response = await this.chat({
        ...options,
        messages,
      });

      if (response.toolCalls.length === 0) {
        return { response, allToolCalls, allToolResults };
      }

      // If response was truncated, tool call arguments are likely incomplete — retry
      if (response.stopReason === 'max_tokens') {
        logger.warn('Response truncated at max_tokens with pending tool calls — asking model to retry');
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: 'Your previous response was truncated due to length limits. Please retry the last tool call, and if the content is very large, split it into smaller parts.',
        });
        continue;
      }

      // Execute tool calls
      const toolResults: ToolResult[] = [];
      for (const toolCall of response.toolCalls) {
        allToolCalls.push(toolCall);
        options.onStream?.({ type: 'tool_call_start', toolCall });

        const result = await executeToolCall(toolCall);
        toolResults.push(result);
        allToolResults.push(result);

        options.onStream?.({ type: 'tool_call_end', toolResult: result });
      }

      // Add assistant response and tool results to messages
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolResults.map(r =>
          `[Tool result for ${r.toolCallId}]: ${r.isError ? 'ERROR: ' : ''}${r.content}`
        ).join('\n'),
      });
    }

    throw new Error('Tool loop exceeded maximum iterations');
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.modelId,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      return true;
    } catch (error) {
      const classified = classifyError(error, 'anthropic');
      if (classified.statusCode === 401) return false;
      // Other errors (rate limit, server) mean the key is valid but something else is wrong
      return true;
    }
  }

  private async chatStream(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[] | undefined,
    options: ModelOptions,
  ): Promise<ModelResponse> {
    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: options.maxTokens ?? this.modelMaxTokens,
      temperature: options.temperature ?? 0,
      system: systemPrompt,
      messages,
      tools,
    });

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    stream.on('text', (text) => {
      textContent += text;
      options.onStream?.({ type: 'text', content: text });
    });

    const finalMessage = await stream.finalMessage();

    // Extract tool calls from content blocks
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls,
      tokenUsage: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
        total: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
      stopReason: finalMessage.stop_reason ?? 'end_turn',
    };
  }

  private parseResponse(response: Anthropic.Message): ModelResponse {
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      stopReason: response.stop_reason ?? 'end_turn',
    };
  }

  private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  private toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));
  }
}
