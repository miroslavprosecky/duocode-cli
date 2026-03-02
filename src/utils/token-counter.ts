/**
 * Token counting utilities.
 * Uses a fast character-based approximation by default.
 * tiktoken can be used for exact counts but is slower to initialize.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateTokensForMessages(
  messages: Array<{ content: string }>,
): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content);
    total += 4; // overhead per message (role, delimiters)
  }
  total += 2; // conversation overhead
  return total;
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n... (truncated)';
}
