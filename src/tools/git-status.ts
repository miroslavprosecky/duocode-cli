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
      { cwd, timeout: 15_000, maxBuffer: 512 * 1024 },
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
 * Register the git_status tool.
 *
 * Returns the output of `git status`, giving an overview of the
 * current working tree and staged changes.
 */
export function registerGitStatusTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'git_status',
    async (_args: Record<string, unknown>): Promise<string> => {
      logger.debug('Running git status');
      const output = await runGit('status', rootPath);
      return output.trim() || '(no output)';
    },
    {
      name: 'git_status',
      description:
        'Show the current git status, including staged, unstaged, and untracked files.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  );
}
