import { readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import type { ToolRegistry } from './tool-registry.js';
import { resolvePath } from '../utils/file-utils.js';
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
 * Register the file_edit tool.
 *
 * Performs a search-and-replace operation on a file. The old_string must
 * appear exactly once in the file to avoid ambiguous edits.
 */
export function registerFileEditTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'file_edit',
    async (args: Record<string, unknown>): Promise<string> => {
      const filePath = args.path as string | undefined;
      const oldString = args.old_string as string | undefined;
      const newString = args.new_string as string | undefined;

      if (!filePath) {
        throw new Error('Missing required parameter: path');
      }
      if (oldString === undefined || oldString === null) {
        throw new Error('Missing required parameter: old_string');
      }
      if (newString === undefined || newString === null) {
        throw new Error('Missing required parameter: new_string');
      }

      const resolved = isAbsolute(filePath)
        ? resolve(filePath)
        : resolvePath(rootPath, filePath);

      assertWithinRoot(resolved, rootPath);

      logger.debug(`Editing file: ${resolved}`);

      const content = await readFile(resolved, 'utf-8');

      // Count occurrences to ensure the replacement is unambiguous
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        return `Failed: The string to replace was not found in ${filePath}`;
      }

      if (occurrences > 1) {
        return `Failed: The string to replace appears ${occurrences} times in ${filePath}. It must appear exactly once for an unambiguous edit.`;
      }

      const updated = content.replace(oldString, newString);
      await writeFile(resolved, updated, 'utf-8');

      return `Successfully edited ${filePath}`;
    },
    {
      name: 'file_edit',
      description:
        'Perform a search-and-replace edit on a file. The old_string must appear exactly once in the file. The path is relative to the project root unless an absolute path is given.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to edit (relative to project root or absolute)',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to search for in the file',
          },
          new_string: {
            type: 'string',
            description: 'The string to replace old_string with',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  );
}
