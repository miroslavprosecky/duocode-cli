import { exec } from 'node:child_process';
import type { ToolRegistry } from './tool-registry.js';
import { logger } from '../utils/logger.js';

/**
 * Run a git command in the given directory and return its output.
 */
function runGit(args: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      `git ${args}`,
      { cwd, timeout: 15_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.trim() || stdout?.trim() || error.message;
          reject(new Error(`git ${args} failed: ${message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Register the git_diff tool.
 *
 * Returns the output of `git diff` (unstaged changes) or
 * `git diff --staged` (staged changes ready to commit).
 */
export function registerGitDiffTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'git_diff',
    async (args: Record<string, unknown>): Promise<string> => {
      const staged = args.staged as boolean | undefined;

      const command = staged ? 'diff --staged' : 'diff';
      logger.debug(`Running git ${command}`);

      const output = await runGit(command, rootPath);
      return output.trim() || '(no changes)';
    },
    {
      name: 'git_diff',
      description:
        'Show git diff output. By default shows unstaged changes. Set staged to true to show only staged changes.',
      parameters: {
        type: 'object',
        properties: {
          staged: {
            type: 'boolean',
            description:
              'If true, show only staged changes (git diff --staged). Defaults to false.',
          },
        },
        required: [],
      },
    },
  );
}
