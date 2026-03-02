import { simpleGit, type SimpleGit, type StatusResult, type LogResult, type BranchSummary } from 'simple-git';
import { logger } from '../utils/logger.js';

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  isClean: boolean;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export class GitManager {
  private readonly git: SimpleGit;
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.git = simpleGit({
      baseDir: rootPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: true,
    });
  }

  async isRepo(): Promise<boolean> {
    try {
      const result = await this.git.checkIsRepo();
      return result;
    } catch (error) {
      logger.debug(`Not a git repository: ${this.rootPath}`);
      return false;
    }
  }

  async status(): Promise<GitStatus> {
    const raw: StatusResult = await this.git.status();

    const staged = [
      ...raw.created,
      ...raw.staged,
    ];

    const renamed = raw.renamed.map((r) => ({
      from: r.from,
      to: r.to,
    }));

    return {
      staged: [...new Set(staged)],
      modified: raw.modified,
      untracked: raw.not_added,
      deleted: raw.deleted,
      renamed,
      isClean: raw.isClean(),
    };
  }

  async diff(staged: boolean = false): Promise<string> {
    const args = staged ? ['--cached'] : [];

    try {
      const result = await this.git.diff(args);
      return result;
    } catch (error) {
      logger.error('Failed to get diff', error);
      throw error;
    }
  }

  async commit(message: string): Promise<string> {
    try {
      const result = await this.git.commit(message);
      const hash = result.commit || 'unknown';
      logger.info(`Committed: ${hash} - ${message}`);
      return hash;
    } catch (error) {
      logger.error('Failed to commit', error);
      throw error;
    }
  }

  async branch(): Promise<BranchSummary> {
    try {
      const result = await this.git.branch();
      return result;
    } catch (error) {
      logger.error('Failed to get branch info', error);
      throw error;
    }
  }

  async log(count: number = 10): Promise<GitLogEntry[]> {
    try {
      const result: LogResult = await this.git.log({
        maxCount: count,
      });

      return result.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
      }));
    } catch (error) {
      logger.error('Failed to get log', error);
      throw error;
    }
  }

  async stageFile(filePath: string): Promise<void> {
    await this.git.add(filePath);
  }

  async stageAll(): Promise<void> {
    await this.git.add('.');
  }

  async getCurrentBranch(): Promise<string> {
    const branchInfo = await this.branch();
    return branchInfo.current;
  }

  async getFileContent(filePath: string, ref: string = 'HEAD'): Promise<string | null> {
    try {
      const content = await this.git.show([`${ref}:${filePath}`]);
      return content;
    } catch {
      return null;
    }
  }
}

export function createGitManager(rootPath: string): GitManager {
  return new GitManager(rootPath);
}
