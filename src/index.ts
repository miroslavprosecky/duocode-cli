import { configManager } from './config/config-manager.js';
import { ClaudeAdapter } from './models/claude-adapter.js';
import { CodexAdapter } from './models/codex-adapter.js';
import { buildContext } from './context/context-builder.js';
import { ToolRegistry } from './tools/tool-registry.js';
import { registerFileReadTool } from './tools/file-read.js';
import { registerFileWriteTool } from './tools/file-write.js';
import { registerFileEditTool } from './tools/file-edit.js';
import { registerFileListTool } from './tools/file-list.js';
import { registerShellExecTool } from './tools/shell-exec.js';
import { registerGitStatusTool } from './tools/git-status.js';
import { registerGitDiffTool } from './tools/git-diff.js';
import { registerGitCommitTool } from './tools/git-commit.js';
import { createGitManager } from './git/git-manager.js';
import { ChangeTracker } from './git/change-tracker.js';
import { SessionManager } from './orchestrator/session-manager.js';
import { runDualAnalysis, runClaudeAnalysis, runCodexReview } from './orchestrator/dual-analysis.js';
import { runImplementationLoop } from './orchestrator/implementation-loop.js';
import { Supervisor } from './orchestrator/supervisor.js';
import { StreamRenderer } from './ui/stream-renderer.js';
import { displayDualAnalysis, displaySingleAnalysis } from './ui/dual-panel.js';
import { displayDiff } from './ui/diff-display.js';
import {
  printHeader, printSuccess, printError, printWarning,
  printSection, printDivider, printKeyValue,
} from './ui/terminal.js';
import { createSpinner } from './ui/spinner.js';
import { askConfirm, askInput, askChoice } from './ui/prompt-input.js';
import { claudeBadge, codexBadge } from './ui/attribution.js';
import { logger } from './utils/logger.js';
import type { SupervisionMode, DuoCodeConfig, ProjectContext } from './models/types.js';
import chalk from 'chalk';

// ─── Model catalogs ──────────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  { name: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { name: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
  { name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  { name: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
];

const OPENAI_MODELS = [
  { name: 'GPT-5.3 Codex', value: 'gpt-5.3-codex' },
  { name: 'GPT-5.2', value: 'gpt-5.2' },
  { name: 'GPT-5.2 Pro', value: 'gpt-5.2-pro' },
  { name: 'GPT-4o', value: 'gpt-4o' },
  { name: 'o3', value: 'o3' },
];

const SUPERVISION_MODES = [
  { name: 'Issues only – Codex comments only on problems', value: 'issues-only' },
  { name: 'Always – Full review after every step', value: 'always' },
  { name: 'Never – No supervision', value: 'never' },
];

// ─── Main class ──────────────────────────────────────────────────────────────

export interface RunOptions {
  supervisionMode?: SupervisionMode;
  implementEnabled?: boolean;
}

export class DuoCode {
  private config!: DuoCodeConfig;
  private claude!: ClaudeAdapter;
  private codex!: CodexAdapter;
  private changeTracker = new ChangeTracker();
  private sessionManager = new SessionManager();
  private projectContext: ProjectContext | null = null;
  private rootPath = process.cwd();
  private initialized = false;

  // ── Initialization (inline setup if needed) ─────────────────────────────

  private async ensureConfig(): Promise<void> {
    if (this.initialized) return;

    const hasConfig = await configManager.exists();
    if (!hasConfig) {
      printWarning('No configuration found. Let\'s set it up now.\n');
      await this.inlineSetup();
    }

    try {
      this.config = await configManager.load();
    } catch {
      printError('Invalid configuration. Let\'s fix it.\n');
      await this.inlineSetup();
      this.config = await configManager.load();
    }

    this.claude = new ClaudeAdapter(this.config.anthropicApiKey, this.config.claudeModel);
    this.codex = new CodexAdapter(this.config.openaiApiKey, this.config.codexModel);
    this.initialized = true;
  }

  private async inlineSetup(): Promise<void> {
    console.log(chalk.dim('  You can change these later with /config\n'));

    const anthropicKey = await askInput('Anthropic API key (sk-ant-...)');
    if (!anthropicKey) {
      printError('Anthropic API key is required.');
      process.exit(1);
    }

    const openaiKey = await askInput('OpenAI API key (sk-...)');
    if (!openaiKey) {
      printError('OpenAI API key is required.');
      process.exit(1);
    }

    const claudeModel = await askChoice('Claude model', CLAUDE_MODELS);
    const codexModel = await askChoice('OpenAI model (supervisor)', OPENAI_MODELS);
    const supervisionMode = await askChoice('Supervision mode', SUPERVISION_MODES) as SupervisionMode;

    // Validate keys
    const spinner = createSpinner('Validating API keys...');
    spinner.start();

    const claudeOk = await new ClaudeAdapter(anthropicKey, claudeModel).validateApiKey();
    const codexOk = await new CodexAdapter(openaiKey, codexModel).validateApiKey();

    if (claudeOk && codexOk) {
      spinner.succeed('Both API keys valid');
    } else {
      const bad = [!claudeOk && 'Anthropic', !codexOk && 'OpenAI'].filter(Boolean).join(', ');
      spinner.fail(`Invalid key(s): ${bad} — saving anyway, fix with /config`);
    }

    await configManager.save({
      anthropicApiKey: anthropicKey,
      openaiApiKey: openaiKey,
      claudeModel,
      codexModel,
      supervisionMode,
      maxSteps: 20,
      tokenBudget: 100000,
      autoCommit: false,
      theme: 'dark',
      forwardAnalysis: 'confirm',
    });

    printSuccess('Configuration saved!\n');
  }

  // ── Context (built once, refreshed on demand) ──────────────────────────

  private async ensureContext(force = false): Promise<ProjectContext> {
    if (this.projectContext && !force) return this.projectContext;

    const spinner = createSpinner('Scanning project...');
    spinner.start();
    this.projectContext = await buildContext(this.rootPath, this.config.tokenBudget);
    spinner.succeed(
      `${this.projectContext.relevantFiles.length} files, ${this.projectContext.totalTokens} tokens` +
      (this.projectContext.gitBranch ? ` (${this.projectContext.gitBranch})` : ''),
    );
    return this.projectContext;
  }

  // ── Interactive REPL ───────────────────────────────────────────────────

  async repl(): Promise<void> {
    await this.ensureConfig();

    printHeader('DuoCode');
    this.printStatus();
    console.log(chalk.dim('  Type a prompt to start. /help for commands. /exit to quit.\n'));

    await this.ensureContext();
    console.log('');

    while (true) {
      let input: string;
      try {
        input = await askInput(chalk.cyan('duo>'));
      } catch {
        // Ctrl+C or closed stdin
        console.log('\nGoodbye!');
        break;
      }

      const trimmed = input.trim();
      if (!trimmed) continue;

      // Slash commands
      if (trimmed.startsWith('/')) {
        const handled = await this.handleCommand(trimmed);
        if (handled === 'exit') break;
        continue;
      }

      // Regular prompt → dual analysis + implementation
      try {
        await this.handlePrompt(trimmed);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
      }

      console.log('');
    }
  }

  // ── Slash commands ─────────────────────────────────────────────────────

  private async handleCommand(cmd: string): Promise<string | void> {
    const [command, ...args] = cmd.split(/\s+/);
    const arg = args.join(' ');

    switch (command) {
      case '/exit':
      case '/quit':
        console.log('Goodbye!');
        return 'exit';

      case '/help':
        this.printHelp();
        break;

      case '/config':
        await this.handleConfigCommand(arg);
        break;

      case '/model':
      case '/models':
        await this.handleModelCommand();
        break;

      case '/supervision':
      case '/mode':
        await this.handleSupervisionCommand();
        break;

      case '/status':
        this.printStatus();
        break;

      case '/context':
      case '/refresh':
        await this.ensureContext(true);
        break;

      case '/review':
        await this.review();
        break;

      case '/rollback':
        await this.rollback();
        break;

      case '/commit':
        await this.handleCommit();
        break;

      case '/update': {
        const { runUpdate } = await import('./updater.js');
        await runUpdate();
        break;
      }

      case '/clear':
        this.sessionManager.clear();
        printSuccess('Conversation history cleared');
        break;

      default:
        printWarning(`Unknown command: ${command}. Type /help for available commands.`);
    }
  }

  private printHelp(): void {
    console.log('');
    printSection('Commands', [
      `${chalk.cyan('/help')}            Show this help`,
      `${chalk.cyan('/config')}          View current configuration`,
      `${chalk.cyan('/config set')}      Edit a config value interactively`,
      `${chalk.cyan('/model')}           Change Claude or OpenAI model`,
      `${chalk.cyan('/mode')}            Change supervision mode`,
      `${chalk.cyan('/status')}          Show current session status`,
      `${chalk.cyan('/context')}         Refresh project context`,
      `${chalk.cyan('/review')}          Review current git diff`,
      `${chalk.cyan('/commit')}          Commit current changes`,
      `${chalk.cyan('/rollback')}        Undo changes from this session`,
      `${chalk.cyan('/update')}          Check for updates`,
      `${chalk.cyan('/clear')}           Clear conversation history`,
      `${chalk.cyan('/exit')}            Exit DuoCode`,
    ].join('\n'));
    console.log('');
  }

  private async handleConfigCommand(arg: string): Promise<void> {
    if (arg === 'set') {
      // Interactive config editing
      const key = await askChoice('Which setting?', [
        { name: 'API keys', value: 'keys' },
        { name: 'Models', value: 'models' },
        { name: 'Supervision mode', value: 'supervision' },
        { name: 'Forward analysis mode', value: 'forwardAnalysis' },
        { name: 'Max steps', value: 'maxSteps' },
        { name: 'Token budget', value: 'tokenBudget' },
      ]);

      switch (key) {
        case 'keys':
          await this.handleKeysCommand();
          break;
        case 'models':
          await this.handleModelCommand();
          break;
        case 'supervision':
          await this.handleSupervisionCommand();
          break;
        case 'forwardAnalysis': {
          const mode = await askChoice('Forward Codex analysis to Claude', [
            { name: 'Confirm – Ask before forwarding', value: 'confirm' },
            { name: 'Auto – Always forward without asking', value: 'auto' },
          ]) as 'auto' | 'confirm';
          this.config.forwardAnalysis = mode;
          await configManager.save({ forwardAnalysis: mode });
          printSuccess(`Forward analysis → ${mode}`);
          break;
        }
        case 'maxSteps': {
          const val = await askInput(`Max steps (current: ${this.config.maxSteps})`);
          const num = parseInt(val, 10);
          if (num > 0 && num <= 100) {
            this.config.maxSteps = num;
            await configManager.save({ maxSteps: num });
            printSuccess(`Max steps set to ${num}`);
          } else {
            printError('Must be 1–100');
          }
          break;
        }
        case 'tokenBudget': {
          const val = await askInput(`Token budget (current: ${this.config.tokenBudget})`);
          const num = parseInt(val, 10);
          if (num >= 1000) {
            this.config.tokenBudget = num;
            await configManager.save({ tokenBudget: num });
            printSuccess(`Token budget set to ${num}`);
          } else {
            printError('Must be at least 1000');
          }
          break;
        }
      }
      return;
    }

    // Show current config
    console.log('');
    printKeyValue('Anthropic key', this.config.anthropicApiKey ? '****' + this.config.anthropicApiKey.slice(-4) : chalk.red('not set'));
    printKeyValue('OpenAI key', this.config.openaiApiKey ? '****' + this.config.openaiApiKey.slice(-4) : chalk.red('not set'));
    printKeyValue('Claude model', this.config.claudeModel);
    printKeyValue('OpenAI model', this.config.codexModel);
    printKeyValue('Supervision', this.config.supervisionMode);
    printKeyValue('Forward analysis', this.config.forwardAnalysis);
    printKeyValue('Max steps', String(this.config.maxSteps));
    printKeyValue('Token budget', String(this.config.tokenBudget));
    console.log(chalk.dim(`\n  Edit with: /config set`));
    console.log('');
  }

  private async handleKeysCommand(): Promise<void> {
    const which = await askChoice('Which key?', [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (Codex/GPT)', value: 'openai' },
    ]);

    const key = await askInput(`New ${which === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`);
    if (!key) return;

    if (which === 'anthropic') {
      const spinner = createSpinner('Validating...');
      spinner.start();
      const valid = await new ClaudeAdapter(key, this.config.claudeModel).validateApiKey();
      valid ? spinner.succeed('Valid') : spinner.fail('Invalid — saving anyway');

      this.config.anthropicApiKey = key;
      await configManager.save({ anthropicApiKey: key });
      this.claude = new ClaudeAdapter(key, this.config.claudeModel);
    } else {
      const spinner = createSpinner('Validating...');
      spinner.start();
      const valid = await new CodexAdapter(key, this.config.codexModel).validateApiKey();
      valid ? spinner.succeed('Valid') : spinner.fail('Invalid — saving anyway');

      this.config.openaiApiKey = key;
      await configManager.save({ openaiApiKey: key });
      this.codex = new CodexAdapter(key, this.config.codexModel);
    }
  }

  private async handleModelCommand(): Promise<void> {
    const which = await askChoice('Which model to change?', [
      { name: `Claude (current: ${this.config.claudeModel})`, value: 'claude' },
      { name: `OpenAI (current: ${this.config.codexModel})`, value: 'openai' },
    ]);

    if (which === 'claude') {
      const model = await askChoice('Select Claude model', CLAUDE_MODELS);
      this.config.claudeModel = model;
      await configManager.save({ claudeModel: model });
      this.claude = new ClaudeAdapter(this.config.anthropicApiKey, model);
      printSuccess(`Claude model → ${model}`);
    } else {
      const model = await askChoice('Select OpenAI model', OPENAI_MODELS);
      this.config.codexModel = model;
      await configManager.save({ codexModel: model });
      this.codex = new CodexAdapter(this.config.openaiApiKey, model);
      printSuccess(`OpenAI model → ${model}`);
    }
  }

  private async handleSupervisionCommand(): Promise<void> {
    const mode = await askChoice('Supervision mode', SUPERVISION_MODES) as SupervisionMode;
    this.config.supervisionMode = mode;
    await configManager.save({ supervisionMode: mode });
    printSuccess(`Supervision → ${mode}`);
  }

  // ── Main prompt handler ────────────────────────────────────────────────

  private async handlePrompt(prompt: string): Promise<void> {
    const context = await this.ensureContext();

    // 1. Claude analysis
    printDivider();
    const claudeSpinner = createSpinner(`${claudeBadge()} Analyzing...`);
    claudeSpinner.start();

    const claudeResult = await runClaudeAnalysis({
      claudeAdapter: this.claude,
      prompt,
      context,
    });

    claudeSpinner.succeed(`${claudeBadge()} Analysis complete`);
    displaySingleAnalysis(claudeResult);

    // 2. User choice: implement / codex review / cancel
    const action = await askChoice('What next?', [
      { name: 'Proceed to implementation', value: 'implement' },
      { name: 'Request Codex review', value: 'codex' },
      { name: 'Cancel', value: 'cancel' },
    ]);

    if (action === 'cancel') {
      printWarning('Cancelled');
      return;
    }

    let supervisorAnalysis: string | undefined;

    // 3. Optional Codex review
    if (action === 'codex') {
      const codexSpinner = createSpinner(`${codexBadge()} Reviewing Claude's plan...`);
      codexSpinner.start();

      const codexResult = await runCodexReview({
        codexAdapter: this.codex,
        prompt,
        context,
        claudeAnalysis: claudeResult.content,
      });

      codexSpinner.succeed(`${codexBadge()} Review complete`);
      displaySingleAnalysis(codexResult);

      // Forward logic (respects forwardAnalysis config)
      if (codexResult.content.length > 0) {
        if (this.config.forwardAnalysis === 'auto') {
          supervisorAnalysis = codexResult.content;
        } else {
          const forward = await askConfirm('Forward Codex analysis to Claude?', true);
          if (forward) supervisorAnalysis = codexResult.content;
        }
      }

      // Confirm implementation after review
      const proceed = await askConfirm('Proceed with implementation?');
      if (!proceed) {
        printWarning('Skipped implementation');
        return;
      }
    }

    // Implementation loop
    printDivider();

    const toolRegistry = this.createToolRegistry();
    const supervisor = new Supervisor({
      codexAdapter: this.codex,
      mode: this.config.supervisionMode,
    });

    const contextSummary = `Project: ${this.rootPath}\nFiles: ${context.fileTree}`;
    const implRenderer = new StreamRenderer();
    let implSpinner: ReturnType<typeof createSpinner> | null = null;

    const session = await runImplementationLoop({
      claude: this.claude,
      toolRegistry,
      supervisor,
      sessionManager: this.sessionManager,
      changeTracker: this.changeTracker,
      prompt,
      context: contextSummary,
      supervisorAnalysis,
      maxSteps: this.config.maxSteps,
      onStream: implRenderer.toCallback(),
      onStepStart: (stepNumber) => {
        implSpinner = createSpinner(`${claudeBadge()} Step ${stepNumber} — thinking...`);
        implSpinner.start();
      },
      onToolCall: (toolCall) => {
        if (implSpinner) {
          implSpinner.update(`${claudeBadge()} Step — calling ${toolCall.name}...`);
        }
      },
      onSupervisorReview: () => {
        if (implSpinner) {
          implSpinner.succeed(`${claudeBadge()} Step complete`);
          implSpinner = null;
        }
        const reviewSpinner = createSpinner(`${codexBadge()} Reviewing changes...`);
        reviewSpinner.start();
        // Will be stopped by onVerdict or onStepComplete
      },
      onStepComplete: (step) => {
        if (implSpinner) {
          implSpinner.succeed(`${claudeBadge()} Step ${step.stepNumber} complete`);
          implSpinner = null;
        }
        if (step.filesChanged.length > 0) {
          printKeyValue(`Step ${step.stepNumber}`, `${step.filesChanged.length} file(s) changed`);
        }
      },
      onVerdict: (verdict) => {
        console.log('');
        console.log(chalk.green('  ── Codex verdict ──────────────────────────'));
        if (verdict.status === 'issues') {
          printWarning(`  ${codexBadge()} Issues: ${verdict.summary}`);
        } else if (verdict.status === 'suggestions') {
          console.log(`  ${codexBadge()} ${verdict.summary}`);
        } else if (verdict.status === 'approved') {
          printSuccess(`  ${codexBadge()} Approved: ${verdict.summary}`);
        }
        if (verdict.issues && verdict.issues.length > 0) {
          for (const issue of verdict.issues) {
            const icon = issue.severity === 'error' ? chalk.red('  ✖') : issue.severity === 'warning' ? chalk.yellow('  ⚠') : chalk.blue('  ℹ');
            const loc = [issue.file, issue.line].filter(Boolean).join(':');
            console.log(`${icon} ${loc ? chalk.dim(loc + ' ') : ''}${issue.message}`);
            if (issue.suggestion) {
              console.log(chalk.dim(`    → ${issue.suggestion}`));
            }
          }
        }
        if (verdict.suggestions && verdict.suggestions.length > 0) {
          console.log(chalk.dim('  Suggestions:'));
          for (const s of verdict.suggestions) {
            console.log(chalk.dim(`    • ${s}`));
          }
        }
        console.log(chalk.green('  ────────────────────────────────────────────'));
        console.log('');
      },
    });

    // Refresh context since files changed
    if (session.filesChanged.size > 0) {
      this.projectContext = null;
    }

    // Summary
    printDivider();
    const duration = ((session.completedAt ?? Date.now()) - session.startedAt) / 1000;
    printKeyValue('Steps', String(session.steps.length));
    printKeyValue('Files', String(session.filesChanged.size));
    printKeyValue('Time', `${duration.toFixed(1)}s`);

    if (session.filesChanged.size > 0) {
      console.log(chalk.dim('  ' + [...session.filesChanged].join('\n  ')));
    }

    printSuccess('Done');
  }

  // ── One-shot run (for `duocode ask`) ───────────────────────────────────

  async run(prompt: string, options: RunOptions = {}): Promise<void> {
    await this.ensureConfig();
    if (options.supervisionMode) {
      this.config.supervisionMode = options.supervisionMode;
    }
    await this.handlePrompt(prompt);

    // Offer commit
    if (options.implementEnabled !== false) {
      await this.offerCommit();
    }
  }

  // ── Review ─────────────────────────────────────────────────────────────

  async review(): Promise<void> {
    await this.ensureConfig();

    const git = createGitManager(this.rootPath);
    if (!(await git.isRepo())) {
      printError('Not a git repository');
      return;
    }

    const diff = await git.diff();
    if (!diff) {
      printWarning('No changes to review');
      return;
    }

    printDivider();
    displayDiff(diff);

    console.log(`\n${claudeBadge()} + ${codexBadge()} Reviewing...\n`);

    const context = await this.ensureContext();
    const analysis = await runDualAnalysis({
      claudeAdapter: this.claude,
      codexAdapter: this.codex,
      prompt: `Review this git diff:\n\`\`\`diff\n${diff}\n\`\`\``,
      context,
    });

    displayDualAnalysis(analysis.claude, analysis.codex);
  }

  // ── Rollback ───────────────────────────────────────────────────────────

  async rollback(): Promise<void> {
    if (!this.changeTracker.hasChanges()) {
      printWarning('No changes to rollback');
      return;
    }

    const changes = this.changeTracker.getChanges();
    console.log(chalk.dim('  Changes:'));
    for (const c of changes) {
      console.log(chalk.dim(`    ${c.type}: ${c.path}`));
    }

    const proceed = await askConfirm('Rollback all changes?', false);
    if (!proceed) return;

    const result = await this.changeTracker.rollback();
    printKeyValue('Restored', String(result.restored.length));
    printKeyValue('Deleted', String(result.deleted.length));
    if (result.failed.length > 0) {
      printWarning(`Failed: ${result.failed.length}`);
    }
    this.projectContext = null; // invalidate context
    printSuccess('Rollback complete');
  }

  // ── Commit ─────────────────────────────────────────────────────────────

  private async handleCommit(): Promise<void> {
    const git = createGitManager(this.rootPath);
    if (!(await git.isRepo())) {
      printError('Not a git repository');
      return;
    }

    const status = await git.status();
    if (status.isClean) {
      printWarning('Nothing to commit');
      return;
    }

    console.log(chalk.dim(`  ${status.modified.length} modified, ${status.untracked.length} untracked, ${status.staged.length} staged`));
    const msg = await askInput('Commit message');
    if (!msg) return;

    await git.stageAll();
    const hash = await git.commit(msg);
    printSuccess(`Committed: ${hash}`);
  }

  private async offerCommit(): Promise<void> {
    const git = createGitManager(this.rootPath);
    if (!(await git.isRepo())) return;

    const status = await git.status();
    if (status.isClean) return;

    console.log('');
    const doCommit = await askConfirm('Commit changes?', false);
    if (!doCommit) return;
    await this.handleCommit();
  }

  // ── Status ─────────────────────────────────────────────────────────────

  private printStatus(): void {
    if (!this.config) return;
    const claudeLabel = CLAUDE_MODELS.find(m => m.value === this.config.claudeModel)?.name ?? this.config.claudeModel;
    const openaiLabel = OPENAI_MODELS.find(m => m.value === this.config.codexModel)?.name ?? this.config.codexModel;
    console.log(
      chalk.dim(`  ${claudeBadge()} ${claudeLabel}  ${codexBadge()} ${openaiLabel}  mode: ${this.config.supervisionMode}`),
    );
  }

  // ── Tool registry ──────────────────────────────────────────────────────

  private createToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    registerFileReadTool(registry, this.rootPath);
    registerFileWriteTool(registry, this.rootPath);
    registerFileEditTool(registry, this.rootPath);
    registerFileListTool(registry, this.rootPath);
    registerShellExecTool(registry, this.rootPath);
    registerGitStatusTool(registry, this.rootPath);
    registerGitDiffTool(registry, this.rootPath);
    registerGitCommitTool(registry, this.rootPath);
    return registry;
  }
}
