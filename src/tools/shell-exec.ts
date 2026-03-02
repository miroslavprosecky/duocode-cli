import { exec } from 'node:child_process';
import { resolve, isAbsolute } from 'node:path';
import type { ToolRegistry } from './tool-registry.js';
import { resolvePath } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

/** Default timeout for shell commands in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Validate that a resolved path lies within the project root.
 */
function assertWithinRoot(dirPath: string, rootPath: string): void {
  const normalizedRoot = resolve(rootPath);
  const normalizedDir = resolve(dirPath);
  if (!normalizedDir.startsWith(normalizedRoot)) {
    throw new Error(
      `Path "${dirPath}" is outside the project root "${normalizedRoot}"`,
    );
  }
}

/**
 * Execute a shell command and return its combined output.
 */
function execCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    const child = exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1 MB
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      },
      (error, stdout, stderr) => {
        const exitCode = error && 'code' in error ? (error.code as number) : 0;
        resolvePromise({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error ? (exitCode || 1) : 0,
        });
      },
    );

    // Ensure the child is cleaned up if something goes wrong
    child.on('error', () => {
      // Handled by the callback above
    });
  });
}

/**
 * Register the shell_exec tool.
 *
 * Executes a shell command in the project directory (or a specified
 * subdirectory) and returns the combined stdout and stderr output.
 * Commands time out after 30 seconds by default.
 */
export function registerShellExecTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'shell_exec',
    async (args: Record<string, unknown>): Promise<string> => {
      const command = args.command as string | undefined;
      const cwd = args.cwd as string | undefined;

      if (!command) {
        throw new Error('Missing required parameter: command');
      }

      let workingDir: string;
      if (cwd) {
        workingDir = isAbsolute(cwd) ? resolve(cwd) : resolvePath(rootPath, cwd);
        assertWithinRoot(workingDir, rootPath);
      } else {
        workingDir = rootPath;
      }

      logger.info(`Executing command: ${command} (cwd: ${workingDir})`);

      const result = await execCommand(command, workingDir, DEFAULT_TIMEOUT_MS);

      const parts: string[] = [];

      if (result.stdout) {
        parts.push(result.stdout);
      }
      if (result.stderr) {
        parts.push(`[stderr]\n${result.stderr}`);
      }

      if (result.exitCode !== 0) {
        parts.push(`[exit code: ${result.exitCode}]`);
      }

      return parts.join('\n') || '(no output)';
    },
    {
      name: 'shell_exec',
      description:
        'Execute a shell command and return its output. The command runs in the project root by default. Use cwd to specify a subdirectory. Commands time out after 30 seconds.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
          cwd: {
            type: 'string',
            description:
              'Working directory for the command (relative to project root or absolute). Defaults to the project root.',
          },
        },
        required: ['command'],
      },
    },
  );
}
