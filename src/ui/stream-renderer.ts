import chalk from 'chalk';
import type { StreamCallback, StreamEvent } from '../models/types.js';

export class StreamRenderer {
  private charCount: number = 0;
  private currentToolCall: string | null = null;
  private hasOutput: boolean = false;

  onToken(text: string): void {
    process.stdout.write(text);
    this.charCount += text.length;
    this.hasOutput = true;
  }

  onToolCall(name: string): void {
    if (this.hasOutput) {
      process.stdout.write('\n');
    }
    process.stdout.write(chalk.dim(`  [calling ${chalk.italic(name)}...]`));
    this.currentToolCall = name;
  }

  onToolResult(result: string): void {
    if (this.currentToolCall) {
      process.stdout.write(chalk.dim(` done\n`));
      this.currentToolCall = null;
    }
  }

  onDone(): void {
    if (this.hasOutput) {
      process.stdout.write('\n');
    }
    this.reset();
  }

  onError(error: Error | string): void {
    if (this.hasOutput) {
      process.stdout.write('\n');
    }
    const message = error instanceof Error ? error.message : error;
    process.stdout.write(chalk.red(`\n[Stream error: ${message}]\n`));
    this.reset();
  }

  toCallback(): StreamCallback {
    return (event: StreamEvent): void => {
      switch (event.type) {
        case 'text':
          if (event.content) {
            this.onToken(event.content);
          }
          break;

        case 'tool_call_start':
          if (event.toolCall?.name) {
            this.onToolCall(event.toolCall.name);
          }
          break;

        case 'tool_call_end':
          if (event.toolResult) {
            this.onToolResult(
              typeof event.toolResult === 'string'
                ? event.toolResult
                : JSON.stringify(event.toolResult),
            );
          }
          break;

        case 'done':
          this.onDone();
          break;

        case 'error':
          this.onError(event.error ?? 'Unknown error');
          break;
      }
    };
  }

  getCharCount(): number {
    return this.charCount;
  }

  private reset(): void {
    this.charCount = 0;
    this.currentToolCall = null;
    this.hasOutput = false;
  }
}
