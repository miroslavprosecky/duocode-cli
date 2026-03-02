import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';

export function displayDiff(diff: string): void {
  const lines = diff.split('\n');

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      console.log(chalk.bold.white(line));
    } else if (line.startsWith('@@')) {
      console.log(chalk.cyan(line));
    } else if (line.startsWith('+')) {
      console.log(chalk.green(line));
    } else if (line.startsWith('-')) {
      console.log(chalk.red(line));
    } else if (line.startsWith('\\')) {
      // "No newline at end of file" marker
      console.log(chalk.dim(line));
    } else {
      console.log(chalk.gray(line));
    }
  }
}

export function generateDiff(
  oldContent: string,
  newContent: string,
  filePath: string,
): string {
  const patch = createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: 3 },
  );

  return patch;
}
