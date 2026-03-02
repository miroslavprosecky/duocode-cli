import type { SupervisorVerdict, SupervisionMode, FileChange } from '../models/types.js';
import type { CodexAdapter } from '../models/codex-adapter.js';
import { CODEX_SYSTEM_PROMPT, buildSupervisorPrompt } from '../models/prompt-templates.js';
import { logger } from '../utils/logger.js';

export interface SupervisorOptions {
  codexAdapter: CodexAdapter;
  mode: SupervisionMode;
}

export class Supervisor {
  private codex: CodexAdapter;
  private mode: SupervisionMode;

  constructor(options: SupervisorOptions) {
    this.codex = options.codexAdapter;
    this.mode = options.mode;
  }

  async reviewStep(
    action: string,
    changedFiles: Array<{ path: string; content: string; diff?: string }>,
  ): Promise<SupervisorVerdict | null> {
    if (this.mode === 'never') {
      return null;
    }

    logger.debug(`Supervisor reviewing step: ${action}`);

    const reviewPrompt = buildSupervisorPrompt(action, changedFiles);
    const verdict = await this.codex.review(CODEX_SYSTEM_PROMPT, reviewPrompt);

    // In issues-only mode, only report if there are actual issues
    if (this.mode === 'issues-only' && verdict.status === 'approved') {
      logger.debug('Supervisor: approved (silent in issues-only mode)');
      return null;
    }

    return verdict;
  }

  setMode(mode: SupervisionMode): void {
    this.mode = mode;
  }

  getMode(): SupervisionMode {
    return this.mode;
  }
}
