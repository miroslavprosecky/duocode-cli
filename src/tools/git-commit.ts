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
 * Register the git_commit tool.
 *
 * Stages all changes and creates a commit with the given message.
 * Returns the git commit output on success.
 */
export function registerGitCommitTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'git_commit',
    async (args: Record<string, unknown>): Promise<string> => {
      const message = args.message as string | undefined;

      if (!message) {
        throw new Error('Missing required parameter: message');
      }

      logger.info(`Creating git commit: ${message}`);

      // Stage all changes first
      await runGit('add -A', rootPath);

      // Create the commit. The message is passed via -m with proper escaping
      // by using the shell's quoting. We escape double quotes and backslashes
      // in the message to prevent injection.
      const sanitizedMessage = message
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

      const output = await runGit(`commit -m "${sanitizedMessage}"`, rootPath);
      return output.trim() || 'Commit created successfully.';
    },
    {
      name: 'git_commit',
      description:
        'Stage all changes and create a git commit with the specified message.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The commit message',
          },
        },
        required: ['message'],
      },
    },
  );
}
