import type { ToolDefinition, ToolCall, ToolResult } from '../models/types.js';
import { logger } from '../utils/logger.js';

/**
 * Handler function that executes a tool's logic.
 * Receives the parsed arguments and returns the result content as a string.
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

interface RegisteredTool {
  name: string;
  handler: ToolHandler;
  definition: ToolDefinition;
}

/**
 * Central registry for all available tools.
 * Manages tool registration, lookup, and execution.
 */
export class ToolRegistry {
  private readonly tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool with its handler and definition.
   * Throws if a tool with the same name is already registered.
   */
  register(name: string, handler: ToolHandler, definition: ToolDefinition): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }

    this.tools.set(name, { name, handler, definition });
    logger.debug(`Registered tool: ${name}`);
  }

  /**
   * Execute a tool call and return the result.
   * Catches errors from the handler and returns them as error results.
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      logger.error(`Unknown tool called: ${toolCall.name}`);
      return {
        toolCallId: toolCall.id,
        content: `Error: Unknown tool "${toolCall.name}"`,
        isError: true,
      };
    }

    logger.debug(`Executing tool: ${toolCall.name}`, toolCall.arguments);

    try {
      const content = await tool.handler(toolCall.arguments);
      return {
        toolCallId: toolCall.id,
        content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Tool "${toolCall.name}" failed: ${message}`);
      return {
        toolCallId: toolCall.id,
        content: `Error: ${message}`,
        isError: true,
      };
    }
  }

  /**
   * Return all registered tool definitions.
   * Used to provide the tool list to Claude's API.
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Check whether a tool with the given name is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/** Singleton tool registry instance. */
export const toolRegistry = new ToolRegistry();
