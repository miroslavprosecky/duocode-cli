/**
 * GitignoreFilter - Parses .gitignore patterns and filters file paths accordingly.
 *
 * Implements a subset of gitignore pattern matching without external dependencies:
 *   - Leading/trailing slashes
 *   - Wildcard `*` and globstar `**`
 *   - Negation with `!`
 *   - Comment lines starting with `#`
 *   - Character classes `[abc]`
 *   - Question mark `?` single-char wildcard
 */

import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { logger } from "../utils/logger.js";

/** A single parsed gitignore rule. */
interface GitignoreRule {
  /** The original pattern text (after trimming). */
  raw: string;
  /** Compiled RegExp derived from the glob pattern. */
  regex: RegExp;
  /** Whether the rule is a negation (starts with `!`). */
  negation: boolean;
  /** Whether the pattern targets directories only (trailing `/`). */
  directoryOnly: boolean;
}

/** Hardcoded paths that are always ignored regardless of .gitignore content. */
const ALWAYS_IGNORED: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  ".env",
];

/**
 * Convert a gitignore-style glob pattern into a RegExp.
 *
 * Handles:
 *   `**`  -> match any number of path segments
 *   `*`   -> match anything except `/`
 *   `?`   -> match a single char except `/`
 *   `[…]` -> character class (passed through)
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;

  // If the pattern does not contain a slash (other than trailing), it should
  // match in any directory, so we anchor it loosely.
  const hasSlash =
    pattern.includes("/") &&
    !(pattern.endsWith("/") && !pattern.slice(0, -1).includes("/"));

  // Strip a leading `/` — it anchors to the repo root which we handle below.
  const anchoredToRoot = pattern.startsWith("/");
  if (anchoredToRoot) {
    pattern = pattern.slice(1);
  }

  // Strip trailing `/` — already captured as `directoryOnly` by the caller.
  if (pattern.endsWith("/")) {
    pattern = pattern.slice(0, -1);
  }

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` or `**` at end
        if (pattern[i + 2] === "/" || i + 2 === pattern.length) {
          // Matches zero or more directories.
          regexStr += "(?:.+/)?";
          i += pattern[i + 2] === "/" ? 3 : 2;
          continue;
        }
        // Inline `**` without trailing slash — treat as `*`.
        regexStr += "[^/]*";
        i += 2;
        continue;
      }
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "[") {
      // Pass character class through until `]`.
      const closeIdx = pattern.indexOf("]", i + 1);
      if (closeIdx === -1) {
        regexStr += "\\[";
        i++;
      } else {
        regexStr += pattern.slice(i, closeIdx + 1);
        i = closeIdx + 1;
      }
    } else if (ch === ".") {
      regexStr += "\\.";
      i++;
    } else if (ch === "\\") {
      // Escaped character.
      if (i + 1 < pattern.length) {
        regexStr += "\\" + pattern[i + 1];
        i += 2;
      } else {
        regexStr += "\\\\";
        i++;
      }
    } else {
      regexStr += ch;
      i++;
    }
  }

  // Anchoring rules:
  //  - If the pattern contains a slash or is anchored, match from the start.
  //  - Otherwise match the basename in any directory.
  let fullRegex: string;
  if (anchoredToRoot || hasSlash) {
    fullRegex = `^${regexStr}(?:/.*)?$`;
  } else {
    fullRegex = `(?:^|/)${regexStr}(?:/.*)?$`;
  }

  return new RegExp(fullRegex);
}

export class GitignoreFilter {
  private rules: GitignoreRule[] = [];
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Load and parse the .gitignore file at the project root.
   * Safe to call even if no .gitignore exists.
   */
  async load(): Promise<void> {
    const gitignorePath = join(this.rootPath, ".gitignore");

    try {
      const content = await readFile(gitignorePath, "utf-8");
      this.parse(content);
      logger.debug(
        `Loaded .gitignore with ${this.rules.length} rule(s) from ${gitignorePath}`,
      );
    } catch {
      logger.debug("No .gitignore found or unreadable; using defaults only.");
    }
  }

  /**
   * Parse raw gitignore content into rules.
   */
  private parse(content: string): void {
    const lines = content.split(/\r?\n/);

    for (const raw of lines) {
      const trimmed = raw.trim();

      // Skip empty lines and comments.
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      let pattern = trimmed;
      const negation = pattern.startsWith("!");
      if (negation) {
        pattern = pattern.slice(1);
      }

      const directoryOnly = pattern.endsWith("/");

      try {
        const regex = globToRegex(pattern);
        this.rules.push({ raw: trimmed, regex, negation, directoryOnly });
      } catch (err) {
        logger.warn(`Skipping invalid gitignore pattern "${trimmed}": ${err}`);
      }
    }
  }

  /**
   * Determine whether a file path (relative to project root, forward-slash separated)
   * should be ignored.
   *
   * @param filePath - Relative path using forward slashes (e.g. `src/index.ts`).
   * @param isDirectory - Set to `true` when checking a directory path.
   * @returns `true` if the path should be ignored.
   */
  isIgnored(filePath: string, isDirectory = false): boolean {
    // Normalise to forward slashes.
    const normalised = filePath.replace(/\\/g, "/").replace(/^\/+/, "");

    // Check hardcoded always-ignored paths first.
    const segments = normalised.split("/");
    for (const segment of segments) {
      if (ALWAYS_IGNORED.includes(segment)) {
        return true;
      }
    }

    // Walk through rules in order; last matching rule wins.
    let ignored = false;

    for (const rule of this.rules) {
      // Directory-only rules apply only when the target is a directory.
      if (rule.directoryOnly && !isDirectory) {
        continue;
      }

      if (rule.regex.test(normalised)) {
        ignored = !rule.negation;
      }
    }

    return ignored;
  }
}

/**
 * Create and initialise a GitignoreFilter for the given root path.
 */
export async function createGitignoreFilter(
  rootPath: string,
): Promise<GitignoreFilter> {
  const filter = new GitignoreFilter(rootPath);
  await filter.load();
  return filter;
}
