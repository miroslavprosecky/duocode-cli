/**
 * ProjectScanner - Recursively scans a project directory and produces a
 * visual file-tree string while collecting all file paths.
 *
 * Respects .gitignore rules via GitignoreFilter.
 * Limits recursion to a configurable depth (default 5).
 * Sorts entries: directories first, then files, both alphabetically.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { logger } from "../utils/logger.js";
import { createGitignoreFilter, GitignoreFilter } from "./gitignore-filter.js";

/** Result returned by `scan()`. */
export interface ScanResult {
  /** A tree-formatted string representation of the project structure. */
  fileTree: string;
  /** Flat list of relative file paths (forward-slash separated). */
  files: string[];
}

/** Default maximum directory depth to recurse into. */
const DEFAULT_MAX_DEPTH = 5;

/**
 * Internal entry representing a directory item for sorting and rendering.
 */
interface DirEntry {
  name: string;
  isDir: boolean;
  fullPath: string;
  relativePath: string;
}

/**
 * Scan a project directory recursively and return a tree-style string along
 * with a flat list of discovered file paths.
 *
 * @param rootPath - Absolute path to the project root directory.
 * @param maxDepth - Maximum directory depth to traverse (default 5).
 */
export async function scan(
  rootPath: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<ScanResult> {
  const filter = await createGitignoreFilter(rootPath);
  const files: string[] = [];
  const treeLines: string[] = [];

  // Root line — show the directory name.
  const rootName = rootPath.replace(/\\/g, "/").split("/").pop() ?? ".";
  treeLines.push(rootName);

  await walkDirectory(rootPath, rootPath, filter, files, treeLines, 0, maxDepth, "");

  logger.debug(`Project scan found ${files.length} file(s).`);

  return {
    fileTree: treeLines.join("\n"),
    files,
  };
}

/**
 * Recursively walk a directory, populating `files` and `treeLines`.
 */
async function walkDirectory(
  dirPath: string,
  rootPath: string,
  filter: GitignoreFilter,
  files: string[],
  treeLines: string[],
  depth: number,
  maxDepth: number,
  prefix: string,
): Promise<void> {
  if (depth >= maxDepth) {
    return;
  }

  let rawEntries: string[];
  try {
    rawEntries = await readdir(dirPath);
  } catch (err) {
    logger.warn(`Unable to read directory ${dirPath}: ${err}`);
    return;
  }

  // Stat each entry and build a typed list, filtering out ignored entries.
  const entries: DirEntry[] = [];

  for (const name of rawEntries) {
    const fullPath = join(dirPath, name);
    const relPath = relative(rootPath, fullPath).replace(/\\/g, "/");

    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch {
      // Broken symlink or permission issue — skip.
      continue;
    }

    const isDir = entryStat.isDirectory();

    if (filter.isIgnored(relPath, isDir)) {
      continue;
    }

    entries.push({
      name,
      isDir,
      fullPath,
      relativePath: relPath,
    });
  }

  // Sort: directories first, then files. Alphabetical within each group.
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isLast ? "    " : "\u2502   ";

    const label = entry.isDir ? `${entry.name}/` : entry.name;
    treeLines.push(`${prefix}${connector}${label}`);

    if (entry.isDir) {
      await walkDirectory(
        entry.fullPath,
        rootPath,
        filter,
        files,
        treeLines,
        depth + 1,
        maxDepth,
        prefix + childPrefix,
      );
    } else {
      files.push(entry.relativePath);
    }
  }
}
