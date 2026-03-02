/**
 * FileReader - Reads multiple project files while staying within a token budget.
 *
 * Uses a simple approximation of 1 token ~ 4 characters.
 * Prioritises smaller files first so that more files can be included within
 * the budget, maximising coverage.
 * Skips binary files automatically.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
import type { RelevantFile } from "../models/types.js";

/** Approximate characters per token. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the token count for a string using the 1 token ~ 4 chars heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Common binary file extensions that should be skipped.
 */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".avi",
  ".mov",
  ".webm",
  ".flac",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".iso",
  ".dmg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".class",
  ".pyc",
  ".pyo",
  ".o",
  ".obj",
  ".lib",
  ".a",
  ".lock",
]);

/**
 * Determine whether a file is likely binary based on its extension.
 */
function isBinaryFile(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }
  const ext = filePath.slice(dotIndex).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Attempt to detect binary content by scanning for null bytes in the first
 * chunk of data.
 */
function hasBinaryContent(buffer: Buffer): boolean {
  // Check the first 8 KB for null bytes — a reliable binary heuristic.
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Read a set of project files into `RelevantFile` entries while respecting a
 * token budget.
 *
 * Files are sorted by size (ascending) before reading so that smaller files
 * are included first, maximising the number of files within the budget.
 *
 * @param files     - Relative file paths (forward-slash separated).
 * @param rootPath  - Absolute root directory for resolving relative paths.
 * @param tokenBudget - Maximum total tokens to read.
 * @returns Array of `RelevantFile` entries that fit within the budget.
 */
export async function readFiles(
  files: string[],
  rootPath: string,
  tokenBudget: number,
): Promise<RelevantFile[]> {
  // Gather file sizes for sorting.
  interface FileWithSize {
    path: string;
    fullPath: string;
    size: number;
  }

  const sized: FileWithSize[] = [];

  for (const filePath of files) {
    if (isBinaryFile(filePath)) {
      logger.debug(`Skipping binary file: ${filePath}`);
      continue;
    }

    const fullPath = join(rootPath, filePath);

    try {
      const st = await stat(fullPath);
      if (!st.isFile()) {
        continue;
      }
      sized.push({ path: filePath, fullPath, size: st.size });
    } catch {
      logger.debug(`Unable to stat file, skipping: ${filePath}`);
    }
  }

  // Sort by size ascending — smaller files first.
  sized.sort((a, b) => a.size - b.size);

  const result: RelevantFile[] = [];
  let tokensUsed = 0;

  for (const entry of sized) {
    // Quick estimate: if even the raw byte size exceeds the remaining budget,
    // skip reading entirely.
    const estimatedTokens = Math.ceil(entry.size / CHARS_PER_TOKEN);
    if (tokensUsed + estimatedTokens > tokenBudget) {
      logger.debug(
        `Skipping ${entry.path} (estimated ${estimatedTokens} tokens would exceed budget).`,
      );
      continue;
    }

    try {
      const buffer = await readFile(entry.fullPath);

      // Check for binary content even if the extension seemed safe.
      if (hasBinaryContent(buffer)) {
        logger.debug(`Skipping binary content: ${entry.path}`);
        continue;
      }

      const content = buffer.toString("utf-8");
      const tokens = estimateTokens(content);

      if (tokensUsed + tokens > tokenBudget) {
        logger.debug(
          `Token budget reached; skipping ${entry.path} (${tokens} tokens).`,
        );
        continue;
      }

      result.push({
        path: entry.path,
        content,
        tokens,
      });

      tokensUsed += tokens;
      logger.debug(
        `Read ${entry.path} (${tokens} tokens, total ${tokensUsed}/${tokenBudget}).`,
      );

      if (tokensUsed >= tokenBudget) {
        logger.debug("Token budget exhausted.");
        break;
      }
    } catch (err) {
      logger.warn(`Failed to read file ${entry.path}: ${err}`);
    }
  }

  logger.info(
    `Read ${result.length} file(s), ${tokensUsed} tokens used of ${tokenBudget} budget.`,
  );

  return result;
}
