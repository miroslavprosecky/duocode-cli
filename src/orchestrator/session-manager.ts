import type { Message, ConversationHistory } from '../models/types.js';

export class SessionManager {
  private claudeHistory: Message[] = [];
  private codexHistory: Message[] = [];
  private maxTokens: number;

  constructor(maxTokens: number = 100000) {
    this.maxTokens = maxTokens;
  }

  addClaudeMessage(message: Message): void {
    this.claudeHistory.push({ ...message, timestamp: Date.now() });
    this.trimIfNeeded(this.claudeHistory);
  }

  addCodexMessage(message: Message): void {
    this.codexHistory.push({ ...message, timestamp: Date.now() });
    this.trimIfNeeded(this.codexHistory);
  }

  getClaudeHistory(): Message[] {
    return [...this.claudeHistory];
  }

  getCodexHistory(): Message[] {
    return [...this.codexHistory];
  }

  getClaudeConversation(): ConversationHistory {
    const tokens = this.estimateTokens(this.claudeHistory);
    return { messages: this.getClaudeHistory(), tokenCount: tokens };
  }

  getCodexConversation(): ConversationHistory {
    const tokens = this.estimateTokens(this.codexHistory);
    return { messages: this.getCodexHistory(), tokenCount: tokens };
  }

  clear(): void {
    this.claudeHistory = [];
    this.codexHistory = [];
  }

  private trimIfNeeded(history: Message[]): void {
    while (history.length > 2 && this.estimateTokens(history) > this.maxTokens) {
      // Keep first (system context) and remove oldest non-first message
      history.splice(1, 1);
    }
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }
}
