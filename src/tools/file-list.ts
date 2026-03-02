import { readdir, stat } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import type { ToolRegistry } from './tool-registry.js';
import { resolvePath, relativePath } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

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
 * Register the file_list tool.
 *
 * Lists the contents of a directory, annotating each entry with its type
 * (file or directory) and size.
 */
export function registerFileListTool(
  registry: { register: ToolRegistry['register'] },
  rootPath: string,
): void {
  registry.register(
    'file_list',
    async (args: Record<string, unknown>): Promise<string> => {
      const dirPath = (args.path as string | undefined) ?? '.';

      const resolved = isAbsolute(dirPath)
        ? resolve(dirPath)
        : resolvePath(rootPath, dirPath);

      assertWithinRoot(resolved, rootPath);

      logger.debug(`Listing directory: ${resolved}`);

      const entries = await readdir(resolved);

      if (entries.length === 0) {
        return `Directory "${dirPath}" is empty.`;
      }

      const lines: string[] = [];

      for (const entry of entries.sort()) {
        try {
          const fullPath = join(resolved, entry);
          const info = await stat(fullPath);
          const type = info.isDirectory() ? 'dir' : 'file';
          const size = info.isDirectory() ? '' : ` (${info.size} bytes)`;
          lines.push(`[${type}] ${entry}${size}`);
        } catch {
          // Entry may have been removed between readdir and stat
          lines.push(`[unknown] ${entry}`);
        }
      }

      return lines.join('\n');
    },
    {
      name: 'file_list',
      description:
        'List the contents of a directory. Each entry shows its type (file or dir) and size. The path is relative to the project root unless an absolute path is given.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Path to the directory to list (relative to project root or absolute). Defaults to the project root.',
          },
        },
        required: ['path'],
      },
    },
  );
}
