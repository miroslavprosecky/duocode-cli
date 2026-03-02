import OpenAI from 'openai';
import { BaseModel, type ModelOptions, type ModelResponse } from './base-model.js';
import type { Message, ToolCall, ToolResult, ToolDefinition, SupervisorVerdict } from './types.js';
import { classifyError, withRetry } from '../errors/api-errors.js';
import { logger } from '../utils/logger.js';

export class CodexAdapter extends BaseModel {
  readonly provider = 'openai' as const;
  readonly modelId: string;
  private client: OpenAI;

  constructor(apiKey: string, modelId: string = 'gpt-4o') {
    super();
    this.modelId = modelId;
    this.client = new OpenAI({ apiKey });
  }

  /** Models that require the Responses API instead of Chat Completions */
  private get usesResponsesApi(): boolean {
    return /codex/i.test(this.modelId);
  }

  /** Newer models (o-series, gpt-5+) require max_completion_tokens instead of max_tokens */
  private tokenLimit(n: number): { max_tokens?: number; max_completion_tokens?: number } {
    const usesNew = /^(o[1-9]|gpt-5)/.test(this.modelId);
    return usesNew ? { max_completion_tokens: n } : { max_tokens: n };
  }

  async chat(options: ModelOptions): Promise<ModelResponse> {
    if (this.usesResponsesApi) {
      return this.chatResponses(options);
    }

    return withRetry(async () => {
      const messages = this.toOpenAIMessages(options.systemPrompt, options.messages);

      if (options.stream && options.onStream) {
        return this.chatStream(messages, options);
      }

      const response = await this.client.chat.completions.create({
        model: this.modelId,
        messages,
        ...this.tokenLimit(options.maxTokens ?? 4096),
        temperature: options.temperature ?? 0,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? '',
        toolCalls: [],
        tokenUsage: {
          input: response.usage?.prompt_tokens ?? 0,
          output: response.usage?.completion_tokens ?? 0,
          total: response.usage?.total_tokens ?? 0,
        },
        stopReason: choice?.finish_reason ?? 'stop',
      };
    }, { provider: 'openai' });
  }

  // ─── Responses API ──────────────────────────────────────────────────────────

  private async chatResponses(options: ModelOptions): Promise<ModelResponse> {
    return withRetry(async () => {
      const input = this.toResponsesInput(options.messages);

      if (options.stream && options.onStream) {
        return this.chatResponsesStream(input, options);
      }

      const response = await this.client.responses.create({
        model: this.modelId,
        instructions: options.systemPrompt,
        input,
        max_output_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
      });

      return {
        content: response.output_text ?? '',
        toolCalls: [],
        tokenUsage: {
          input: response.usage?.input_tokens ?? 0,
          output: response.usage?.output_tokens ?? 0,
          total: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        },
        stopReason: response.status === 'completed' ? 'stop' : (response.status ?? 'stop'),
      };
    }, { provider: 'openai' });
  }

  private async chatResponsesStream(
    input: OpenAI.Responses.ResponseInputItem[],
    options: ModelOptions,
  ): Promise<ModelResponse> {
    const stream = await this.client.responses.create({
      model: this.modelId,
      instructions: options.systemPrompt,
      input,
      max_output_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      stream: true,
    });

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        const delta = (event as any).delta ?? '';
        if (delta) {
          content += delta;
          options.onStream?.({ type: 'text', content: delta });
        }
      }
      if (event.type === 'response.completed') {
        const usage = (event as any).response?.usage;
        if (usage) {
          inputTokens = usage.input_tokens ?? 0;
          outputTokens = usage.output_tokens ?? 0;
        }
      }
    }

    return {
      content,
      toolCalls: [],
      tokenUsage: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      stopReason: 'stop',
    };
  }

  private toResponsesInput(messages: Message[]): OpenAI.Responses.ResponseInputItem[] {
    const result: OpenAI.Responses.ResponseInputItem[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      result.push({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      } as OpenAI.Responses.ResponseInputItem);
    }
    return result;
  }

  // ─── Shared methods ─────────────────────────────────────────────────────────

  async chatWithToolLoop(
    options: ModelOptions,
    executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>,
  ): Promise<{ response: ModelResponse; allToolCalls: ToolCall[]; allToolResults: ToolResult[] }> {
    // Codex is used as supervisor only, no tool loop needed
    const response = await this.chat(options);
    return { response, allToolCalls: [], allToolResults: [] };
  }

  async review(
    systemPrompt: string,
    reviewContent: string,
  ): Promise<SupervisorVerdict> {
    const response = await this.chat({
      systemPrompt,
      messages: [{ role: 'user', content: reviewContent }],
      temperature: 0,
    });

    return this.parseVerdict(response.content);
  }

  async validateApiKey(): Promise<boolean> {
    try {
      if (this.usesResponsesApi) {
        await this.client.responses.create({
          model: this.modelId,
          input: 'Hello',
          max_output_tokens: 10,
        });
      } else {
        await this.client.chat.completions.create({
          model: this.modelId,
          ...this.tokenLimit(10),
          messages: [{ role: 'user', content: 'Hello' }],
        });
      }
      return true;
    } catch (error) {
      const classified = classifyError(error, 'openai');
      if (classified.statusCode === 401) return false;
      if (classified.statusCode === 404 || classified.statusCode === 403) {
        logger.warn(`OpenAI key valid but model "${this.modelId}" not accessible: ${classified.message}`);
      }
      return true;
    }
  }

  private parseVerdict(content: string): SupervisorVerdict {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          status: parsed.status ?? 'approved',
          summary: parsed.summary ?? content,
          issues: parsed.issues ?? [],
          suggestions: parsed.suggestions ?? [],
        };
      }
    } catch {
      logger.debug('Failed to parse supervisor verdict as JSON');
    }

    // Fallback: heuristic classification
    const lower = content.toLowerCase();
    if (lower.includes('error') || lower.includes('bug') || lower.includes('vulnerability')) {
      return { status: 'issues', summary: content, issues: [], suggestions: [] };
    }
    if (lower.includes('suggest') || lower.includes('consider') || lower.includes('could')) {
      return { status: 'suggestions', summary: content, suggestions: [content] };
    }
    return { status: 'approved', summary: content };
  }

  private async chatStream(
    messages: OpenAI.ChatCompletionMessageParam[],
    options: ModelOptions,
  ): Promise<ModelResponse> {
    const stream = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      ...this.tokenLimit(options.maxTokens ?? 4096),
      temperature: options.temperature ?? 0,
      stream: true,
    });

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        content += delta;
        options.onStream?.({ type: 'text', content: delta });
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    return {
      content,
      toolCalls: [],
      tokenUsage: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      stopReason: 'stop',
    };
  }

  private toOpenAIMessages(
    systemPrompt: string,
    messages: Message[],
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const m of messages) {
      if (m.role === 'system') continue;
      result.push({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      });
    }

    return result;
  }
}
