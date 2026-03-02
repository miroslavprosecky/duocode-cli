import { resolve, isAbsolute } from 'node:path';
import type { ToolRegistry } from './tool-registry.js';
import { resolvePath, safeWriteFile } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

/**
 * Validate that a resolved path lies within the project root.
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
 * Register the file_write tool.
 *
 * Writes content to a file, creating intermediate directories as needed.
 * The path is resolved relative to the project root.
 */
export function registerFileWriteTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'file_write',
    async (args: Record<string, unknown>): Promise<string> => {
      const filePath = args.path as string | undefined;
      const content = args.content as string | undefined;

      if (!filePath) {
        throw new Error('Missing required parameter: path');
      }
      if (content === undefined || content === null) {
        throw new Error('Missing required parameter: content');
      }

      const resolved = isAbsolute(filePath)
        ? resolve(filePath)
        : resolvePath(rootPath, filePath);

      assertWithinRoot(resolved, rootPath);

      logger.debug(`Writing file: ${resolved} (${String(content).length} bytes)`);

      await safeWriteFile(resolved, String(content));

      return `Successfully wrote ${String(content).length} bytes to ${filePath}`;
    },
    {
      name: 'file_write',
      description:
        'Write content to a file. Creates parent directories if they do not exist. The path is relative to the project root unless an absolute path is given.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to write (relative to project root or absolute)',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  );
}
