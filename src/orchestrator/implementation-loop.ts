import type {
  ImplementationStep,
  ImplementationSession,
  ToolCall,
  ToolResult,
  SupervisorVerdict,
  StreamCallback,
  FileChange,
} from '../models/types.js';
import type { ClaudeAdapter } from '../models/claude-adapter.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { Supervisor } from './supervisor.js';
import type { SessionManager } from './session-manager.js';
import type { ChangeTracker } from '../git/change-tracker.js';
import { CLAUDE_SYSTEM_PROMPT } from '../models/prompt-templates.js';
import { logger } from '../utils/logger.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPatch } from 'diff';

export interface ImplementationLoopOptions {
  claude: ClaudeAdapter;
  toolRegistry: ToolRegistry;
  supervisor: Supervisor;
  sessionManager: SessionManager;
  changeTracker: ChangeTracker;
  prompt: string;
  context: string;
  supervisorAnalysis?: string;
  maxSteps: number;
  onStream?: StreamCallback;
  onStepStart?: (stepNumber: number) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onSupervisorReview?: () => void;
  onStepComplete?: (step: ImplementationStep) => void;
  onVerdict?: (verdict: SupervisorVerdict) => void;
}

export async function runImplementationLoop(
  options: ImplementationLoopOptions,
): Promise<ImplementationSession> {
  const session: ImplementationSession = {
    id: crypto.randomUUID(),
    prompt: options.prompt,
    steps: [],
    filesChanged: new Set(),
    startedAt: Date.now(),
  };

  const analysisPart = options.supervisorAnalysis
    ? `\n\n## Supervisor's Analysis\n${options.supervisorAnalysis}\n`
    : '';
  const fullPrompt = `${options.context}${analysisPart}\n\n## Task\n${options.prompt}\n\nUse the available tools to implement this. Read relevant files first, then make changes.`;

  options.sessionManager.addClaudeMessage({ role: 'user', content: fullPrompt });

  for (let stepNum = 1; stepNum <= options.maxSteps; stepNum++) {
    logger.debug(`Implementation step ${stepNum}/${options.maxSteps}`);
    options.onStepStart?.(stepNum);

    const step: ImplementationStep = {
      stepNumber: stepNum,
      action: '',
      toolCalls: [],
      toolResults: [],
      filesChanged: [],
    };

    try {
      const { response, allToolCalls, allToolResults } = await options.claude.chatWithToolLoop(
        {
          systemPrompt: CLAUDE_SYSTEM_PROMPT,
          messages: options.sessionManager.getClaudeHistory(),
          tools: options.toolRegistry.getDefinitions(),
          stream: !!options.onStream,
          onStream: options.onStream,
        },
        async (toolCall: ToolCall) => {
          options.onToolCall?.(toolCall);
          const result = await options.toolRegistry.execute(toolCall);

          // Track file changes
          if (toolCall.name === 'file_write' || toolCall.name === 'file_edit') {
            const filePath = toolCall.arguments['path'] as string;
            step.filesChanged.push(filePath);
            session.filesChanged.add(filePath);
          }

          return result;
        },
      );

      step.action = response.content;
      step.toolCalls = allToolCalls;
      step.toolResults = allToolResults;

      options.sessionManager.addClaudeMessage({ role: 'assistant', content: response.content });

      // Add tool results to session history so next step starts with user message
      if (allToolResults.length > 0) {
        const toolResultsSummary = allToolResults.map(r =>
          `[Tool result for ${r.toolCallId}]: ${r.isError ? 'ERROR: ' : ''}${r.content}`
        ).join('\n');
        options.sessionManager.addClaudeMessage({ role: 'user', content: toolResultsSummary });
      }

      // Supervisor review if files were changed
      if (step.filesChanged.length > 0) {
        options.onSupervisorReview?.();
        const changedFilesContent = await getChangedFilesContent(step.filesChanged);
        const verdict = await options.supervisor.reviewStep(response.content, changedFilesContent);

        if (verdict) {
          step.verdict = verdict;
          options.onVerdict?.(verdict);

          if (verdict.status === 'issues') {
            // Feed issues back to Claude
            const feedback = formatVerdictFeedback(verdict);
            options.sessionManager.addClaudeMessage({ role: 'user', content: feedback });
            logger.info('Supervisor found issues, feeding back to Claude');
            // Continue loop - Claude will attempt to fix
            session.steps.push(step);
            options.onStepComplete?.(step);
            continue;
          }
        }
      }

      session.steps.push(step);
      options.onStepComplete?.(step);

      // If Claude didn't use any tools and produced a final response, we're done
      if (allToolCalls.length === 0) {
        logger.debug('Implementation complete (no more tool calls)');
        break;
      }
    } catch (error) {
      logger.error(`Step ${stepNum} failed:`, error);
      step.action = `Error: ${error instanceof Error ? error.message : String(error)}`;
      session.steps.push(step);
      break;
    }
  }

  session.completedAt = Date.now();
  return session;
}

async function getChangedFilesContent(
  paths: string[],
): Promise<Array<{ path: string; content: string; diff?: string }>> {
  const results: Array<{ path: string; content: string; diff?: string }> = [];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const content = await readFile(p, 'utf-8');
        results.push({ path: p, content });
      }
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

function formatVerdictFeedback(verdict: SupervisorVerdict): string {
  let feedback = `The code reviewer found issues:\n\n${verdict.summary}\n`;

  if (verdict.issues && verdict.issues.length > 0) {
    feedback += '\n## Issues\n';
    for (const issue of verdict.issues) {
      feedback += `\n- [${issue.severity.toUpperCase()}]`;
      if (issue.file) feedback += ` ${issue.file}`;
      if (issue.line) feedback += `:${issue.line}`;
      feedback += ` ${issue.message}`;
      if (issue.suggestion) feedback += `\n  Suggestion: ${issue.suggestion}`;
    }
  }

  if (verdict.suggestions && verdict.suggestions.length > 0) {
    feedback += '\n\n## Suggestions\n';
    for (const suggestion of verdict.suggestions) {
      feedback += `\n- ${suggestion}`;
    }
  }

  feedback += '\n\nPlease address these issues and suggestions, then continue.';
  return feedback;
}
