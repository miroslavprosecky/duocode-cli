import type { AnalysisResult, ProjectContext, StreamCallback } from '../models/types.js';
import type { ClaudeAdapter } from '../models/claude-adapter.js';
import type { CodexAdapter } from '../models/codex-adapter.js';
import { CLAUDE_SYSTEM_PROMPT, CODEX_SYSTEM_PROMPT, buildAnalysisPrompt, buildCodexReviewPrompt } from '../models/prompt-templates.js';
import { logger } from '../utils/logger.js';

export interface DualAnalysisOptions {
  claudeAdapter: ClaudeAdapter;
  codexAdapter: CodexAdapter;
  prompt: string;
  context: ProjectContext;
  onClaudeStream?: StreamCallback;
  onCodexStream?: StreamCallback;
}

export interface DualAnalysisResult {
  claude: AnalysisResult;
  codex: AnalysisResult;
}

export async function runDualAnalysis(options: DualAnalysisOptions): Promise<DualAnalysisResult> {
  const contextSummary = formatContextForPrompt(options.context);
  const claudePrompt = buildAnalysisPrompt('implementor', options.prompt, contextSummary);
  const codexPrompt = buildAnalysisPrompt('supervisor', options.prompt, contextSummary);

  logger.debug('Starting dual analysis...');

  // Always use streaming — Anthropic API requires it for large max_tokens
  const noopStream: StreamCallback = () => {};

  const [claudeResult, codexResult] = await Promise.allSettled([
    options.claudeAdapter.chat({
      systemPrompt: CLAUDE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: claudePrompt }],
      stream: true,
      onStream: options.onClaudeStream ?? noopStream,
      temperature: 0,
    }),
    options.codexAdapter.chat({
      systemPrompt: CODEX_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: codexPrompt }],
      stream: true,
      onStream: options.onCodexStream ?? noopStream,
      temperature: 0,
    }),
  ]);

  const claude: AnalysisResult = {
    model: options.claudeAdapter.modelId,
    role: 'implementor',
    content: claudeResult.status === 'fulfilled' ? claudeResult.value.content : `Error: ${(claudeResult as PromiseRejectedResult).reason}`,
    tokenUsage: claudeResult.status === 'fulfilled' ? claudeResult.value.tokenUsage : { input: 0, output: 0, total: 0 },
  };

  const codex: AnalysisResult = {
    model: options.codexAdapter.modelId,
    role: 'supervisor',
    content: codexResult.status === 'fulfilled' ? codexResult.value.content : `Error: ${(codexResult as PromiseRejectedResult).reason}`,
    tokenUsage: codexResult.status === 'fulfilled' ? codexResult.value.tokenUsage : { input: 0, output: 0, total: 0 },
  };

  logger.debug(
    `Dual analysis complete. Claude: ${claude.tokenUsage.total} tokens, Codex: ${codex.tokenUsage.total} tokens`,
  );

  return { claude, codex };
}

export async function runClaudeAnalysis(options: {
  claudeAdapter: ClaudeAdapter;
  prompt: string;
  context: ProjectContext;
  onStream?: StreamCallback;
}): Promise<AnalysisResult> {
  const contextSummary = formatContextForPrompt(options.context);
  const claudePrompt = buildAnalysisPrompt('implementor', options.prompt, contextSummary);
  const noopStream: StreamCallback = () => {};

  const result = await options.claudeAdapter.chat({
    systemPrompt: CLAUDE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: claudePrompt }],
    stream: true,
    onStream: options.onStream ?? noopStream,
    temperature: 0,
  });

  return {
    model: options.claudeAdapter.modelId,
    role: 'implementor',
    content: result.content,
    tokenUsage: result.tokenUsage,
  };
}

export async function runCodexReview(options: {
  codexAdapter: CodexAdapter;
  prompt: string;
  context: ProjectContext;
  claudeAnalysis: string;
  onStream?: StreamCallback;
}): Promise<AnalysisResult> {
  const contextSummary = formatContextForPrompt(options.context);
  const codexPrompt = buildCodexReviewPrompt(options.prompt, contextSummary, options.claudeAnalysis);
  const noopStream: StreamCallback = () => {};

  const result = await options.codexAdapter.chat({
    systemPrompt: CODEX_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: codexPrompt }],
    stream: true,
    onStream: options.onStream ?? noopStream,
    temperature: 0,
  });

  return {
    model: options.codexAdapter.modelId,
    role: 'supervisor',
    content: result.content,
    tokenUsage: result.tokenUsage,
  };
}

/** Max characters for the formatted context (~50K tokens at 4 chars/token). */
const MAX_CONTEXT_CHARS = 200_000;

export function formatContextForPrompt(context: ProjectContext): string {
  let summary = `Project root: ${context.rootPath}\n`;
  summary += `\n### File Tree\n\`\`\`\n${context.fileTree}\n\`\`\`\n`;

  if (context.gitBranch) {
    summary += `\nGit branch: ${context.gitBranch}\n`;
  }
  if (context.gitStatus) {
    summary += `\n### Git Status\n\`\`\`\n${context.gitStatus}\n\`\`\`\n`;
  }

  if (context.relevantFiles.length > 0) {
    summary += `\n### Key Files\n`;
    for (const file of context.relevantFiles) {
      const entry = `\n#### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
      if (summary.length + entry.length > MAX_CONTEXT_CHARS) {
        summary += `\n...(${context.relevantFiles.length - context.relevantFiles.indexOf(file)} more files omitted due to context limit)\n`;
        break;
      }
      summary += entry;
    }
  }

  return summary;
}
