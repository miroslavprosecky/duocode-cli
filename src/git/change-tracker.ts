import { writeFile, unlink, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FileChange } from '../models/types.js';
import { logger } from '../utils/logger.js';

export class ChangeTracker {
  private changes: FileChange[] = [];

  recordChange(change: FileChange): void {
    this.changes.push({ ...change });
    logger.debug(`Recorded ${change.type} change: ${change.path}`);
  }

  getChanges(): FileChange[] {
    return [...this.changes];
  }

  async rollback(): Promise<{ restored: string[]; deleted: string[]; failed: string[] }> {
    const restored: string[] = [];
    const deleted: string[] = [];
    const failed: string[] = [];

    // Process changes in reverse order to undo them correctly
    const reversedChanges = [...this.changes].reverse();

    for (const change of reversedChanges) {
      try {
        switch (change.type) {
          case 'create': {
            // File was created, so delete it to rollback
            await unlink(change.path);
            deleted.push(change.path);
            logger.debug(`Rollback: deleted created file ${change.path}`);
            break;
          }

          case 'modify': {
            // File was modified, restore original content
            if (change.originalContent !== undefined) {
              await ensureDirectory(change.path);
              await writeFile(change.path, change.originalContent, 'utf-8');
              restored.push(change.path);
              logger.debug(`Rollback: restored original content of ${change.path}`);
            } else {
              logger.warn(`Rollback: no original content stored for ${change.path}, skipping`);
              failed.push(change.path);
            }
            break;
          }

          case 'delete': {
            // File was deleted, recreate it with original content
            if (change.originalContent !== undefined) {
              await ensureDirectory(change.path);
              await writeFile(change.path, change.originalContent, 'utf-8');
              restored.push(change.path);
              logger.debug(`Rollback: recreated deleted file ${change.path}`);
            } else {
              logger.warn(`Rollback: no original content stored for deleted file ${change.path}, skipping`);
              failed.push(change.path);
            }
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Rollback failed for ${change.path}: ${message}`);
        failed.push(change.path);
      }
    }

    this.changes = [];

    logger.info(
      `Rollback complete: ${restored.length} restored, ${deleted.length} deleted, ${failed.length} failed`,
    );

    return { restored, deleted, failed };
  }

  clear(): void {
    const count = this.changes.length;
    this.changes = [];
    logger.debug(`Cleared ${count} tracked changes`);
  }

  get size(): number {
    return this.changes.length;
  }

  hasChanges(): boolean {
    return this.changes.length > 0;
  }
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}
