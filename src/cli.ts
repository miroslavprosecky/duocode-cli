import { Command } from 'commander';
import { logger } from './utils/logger.js';

export function createCLI(version: string): Command {
  const program = new Command();

  program
    .name('duocode')
    .description('AI Pair Programming CLI – Claude implements, Codex supervises')
    .version(version);

  program
    .command('ask <prompt>')
    .description('One-shot prompt – analyze and implement')
    .option('-s, --supervision <mode>', 'Supervision mode: issues-only, always, never', 'issues-only')
    .option('--no-implement', 'Only analyze, do not implement')
    .action(async (prompt: string, opts) => {
      const { DuoCode } = await import('./index.js');
      const duo = new DuoCode();
      await duo.run(prompt, {
        supervisionMode: opts.supervision,
        implementEnabled: opts.implement !== false,
      });
    });

  // Default: interactive REPL
  program
    .option('-v, --verbose', 'Enable debug logging')
    .action(async (opts) => {
      if (opts.verbose) {
        logger.setLevel('debug');
      }

      const { DuoCode } = await import('./index.js');
      const duo = new DuoCode();
      await duo.repl();
    });

  return program;
}
