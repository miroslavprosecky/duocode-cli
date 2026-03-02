/**
 * ContextBuilder - Orchestrates project scanning and file reading to produce
 * a complete ProjectContext.
 *
 * Uses ProjectScanner to discover the file tree and file list, FileReader to
 * load file contents within a token budget, and simple-git to gather git
 * status and branch information.
 */

import { simpleGit, type SimpleGit } from "simple-git";
import { logger } from "../utils/logger.js";
import type { ProjectContext } from "../models/types.js";
import { scan } from "./project-scanner.js";
import { readFiles } from "./file-reader.js";

/** Default token budget when none is specified. */
const DEFAULT_TOKEN_BUDGET = 120_000;

/**
 * Retrieve the current git branch name, or `undefined` if not in a git repo.
 */
async function getGitBranch(git: SimpleGit): Promise<string | undefined> {
  try {
    const branchSummary = await git.branchLocal();
    return branchSummary.current || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Retrieve a concise git status string, or `undefined` if not in a git repo.
 */
async function getGitStatus(git: SimpleGit): Promise<string | undefined> {
  try {
    const status = await git.status();

    const parts: string[] = [];

    if (status.modified.length > 0) {
      parts.push(`${status.modified.length} modified`);
    }
    if (status.created.length > 0) {
      parts.push(`${status.created.length} added`);
    }
    if (status.deleted.length > 0) {
      parts.push(`${status.deleted.length} deleted`);
    }
    if (status.renamed.length > 0) {
      parts.push(`${status.renamed.length} renamed`);
    }
    if (status.not_added.length > 0) {
      parts.push(`${status.not_added.length} untracked`);
    }

    if (parts.length === 0) {
      return "clean";
    }

    return parts.join(", ");
  } catch {
    return undefined;
  }
}

/**
 * Build a full ProjectContext for the given project root.
 *
 * Steps:
 *  1. Scan the project directory tree (respecting .gitignore).
 *  2. Gather git branch and status information.
 *  3. Read file contents within the token budget.
 *  4. Return the assembled ProjectContext.
 *
 * @param rootPath    - Absolute path to the project root.
 * @param tokenBudget - Maximum token budget for file contents (default 120 000).
 */
export async function buildContext(
  rootPath: string,
  tokenBudget: number = DEFAULT_TOKEN_BUDGET,
): Promise<ProjectContext> {
  logger.info(`Building project context for: ${rootPath}`);

  // Step 1: Scan the project directory.
  const { fileTree, files } = await scan(rootPath);
  logger.debug(`File tree contains ${files.length} file(s).`);

  // Step 2: Gather git information in parallel.
  const git: SimpleGit = simpleGit(rootPath);

  const [gitBranch, gitStatus] = await Promise.all([
    getGitBranch(git),
    getGitStatus(git),
  ]);

  if (gitBranch) {
    logger.debug(`Git branch: ${gitBranch}`);
  }
  if (gitStatus) {
    logger.debug(`Git status: ${gitStatus}`);
  }

  // Step 3: Read files within the token budget.
  const relevantFiles = await readFiles(files, rootPath, tokenBudget);

  const totalTokens = relevantFiles.reduce((sum, f) => sum + f.tokens, 0);

  // Step 4: Assemble context.
  const context: ProjectContext = {
    rootPath,
    fileTree,
    gitBranch,
    gitStatus,
    relevantFiles,
    totalTokens,
  };

  logger.info(
    `Context built: ${relevantFiles.length} file(s), ${totalTokens} tokens, branch=${gitBranch ?? "n/a"}.`,
  );

  return context;
}

/**
 * Singleton context builder with a convenient API.
 */
export const contextBuilder = {
  buildContext,
} as const;
