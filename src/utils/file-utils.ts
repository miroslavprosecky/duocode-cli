import { resolve, relative, dirname } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export function resolvePath(basePath: string, filePath: string): string {
  if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:\\/)) {
    return resolve(filePath);
  }
  return resolve(basePath, filePath);
}

export function relativePath(basePath: string, filePath: string): string {
  return relative(basePath, filePath).replace(/\\/g, '/');
}

export async function safeWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, content, 'utf-8');
}

export function isTextFile(filePath: string): boolean {
  const textExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.json', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.txt', '.csv',
    '.html', '.css', '.scss', '.less',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
    '.sh', '.bash', '.zsh', '.fish',
    '.env', '.gitignore', '.dockerignore',
    '.sql', '.graphql',
    '.vue', '.svelte',
    '.lock',
  ]);

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return textExtensions.has(ext) || !filePath.includes('.');
}
