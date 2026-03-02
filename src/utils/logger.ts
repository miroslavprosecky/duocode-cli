import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: unknown[]): void {
    if (LEVEL_ORDER[this.level] <= LEVEL_ORDER.debug) {
      console.error(chalk.gray('[DEBUG]'), ...args);
    }
  }

  info(...args: unknown[]): void {
    if (LEVEL_ORDER[this.level] <= LEVEL_ORDER.info) {
      console.error(chalk.blue('[INFO]'), ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (LEVEL_ORDER[this.level] <= LEVEL_ORDER.warn) {
      console.error(chalk.yellow('[WARN]'), ...args);
    }
  }

  error(...args: unknown[]): void {
    if (LEVEL_ORDER[this.level] <= LEVEL_ORDER.error) {
      console.error(chalk.red('[ERROR]'), ...args);
    }
  }
}

export const logger = new Logger();
