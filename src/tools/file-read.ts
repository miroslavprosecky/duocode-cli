import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import type { ToolRegistry } from './tool-registry.js';
import { resolvePath } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

/**
 * Validate that a resolved path lies within the project root.
 * Prevents directory-traversal attacks.
 */
function assertWithinRoot(filePath: string, rootPath: string): void {
  const normalizedRoot = resolve(rootPath);
  const normalizedFile = resolve(filePath);
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error(
      `Path "${filePath}" is outside the project root "${normalizedRoot}"`,
    );
  }
}

/**
 * Register the file_read tool.
 *
 * Reads the full content of a file and returns it as a string.
 * The path is resolved relative to the project root.
 */
export function registerFileReadTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'file_read',
    async (args: Record<string, unknown>): Promise<string> => {
      const filePath = args.path as string | undefined;
      if (!filePath) {
        throw new Error('Missing required parameter: path');
      }

      const resolved = isAbsolute(filePath)
        ? resolve(filePath)
        : resolvePath(rootPath, filePath);

      assertWithinRoot(resolved, rootPath);

      logger.debug(`Reading file: ${resolved}`);

      const content = await readFile(resolved, 'utf-8');
      return content;
    },
    {
      name: 'file_read',
      description:
        'Read the contents of a file. The path is relative to the project root unless an absolute path is given.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read (relative to project root or absolute)',
          },
        },
        required: ['path'],
      },
    },
  );
}
