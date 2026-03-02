import chalk from 'chalk';

export function printHeader(text: string): void {
  const line = '='.repeat(Math.max(text.length + 4, 50));
  console.log('');
  console.log(chalk.bold.cyan(line));
  console.log(chalk.bold.cyan(`  ${text}`));
  console.log(chalk.bold.cyan(line));
  console.log('');
}

export function printSection(title: string, content: string): void {
  console.log('');
  console.log(chalk.bold.underline(title));
  console.log('');

  for (const line of content.split('\n')) {
    console.log(`  ${line}`);
  }

  console.log('');
}

export function printSuccess(message: string): void {
  console.log(chalk.green(`[OK] ${message}`));
}

export function printError(message: string): void {
  console.log(chalk.red(`[ERROR] ${message}`));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(`[WARN] ${message}`));
}

export function printDivider(): void {
  const width = Math.min(process.stdout.columns || 80, 80);
  console.log(chalk.dim('-'.repeat(width)));
}

export function printKeyValue(key: string, value: string): void {
  console.log(`${chalk.bold.white(key + ':')} ${chalk.gray(value)}`);
}
