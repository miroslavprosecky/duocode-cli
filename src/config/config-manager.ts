import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { configSchema, type ValidatedConfig } from './config-schema.js';
import { logger } from '../utils/logger.js';

const CONFIG_DIR = join(homedir(), '.duocode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export class ConfigManager {
  private config: ValidatedConfig | null = null;

  async load(): Promise<ValidatedConfig> {
    if (this.config) return this.config;

    const raw = await this.readConfigFile();
    const withEnv = this.applyEnvOverrides(raw);
    this.config = configSchema.parse(withEnv);
    return this.config;
  }

  async save(config: Partial<ValidatedConfig>): Promise<void> {
    await this.ensureConfigDir();
    const existing = await this.readConfigFile();
    const merged = { ...existing, ...config };
    await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    this.config = null; // invalidate cache
    logger.debug('Config saved to', CONFIG_FILE);
  }

  async exists(): Promise<boolean> {
    return existsSync(CONFIG_FILE);
  }

  async getConfigPath(): Promise<string> {
    return CONFIG_FILE;
  }

  private async readConfigFile(): Promise<Record<string, unknown>> {
    if (!existsSync(CONFIG_FILE)) return {};
    try {
      const text = await readFile(CONFIG_FILE, 'utf-8');
      return JSON.parse(text);
    } catch {
      logger.warn('Failed to read config file, using defaults');
      return {};
    }
  }

  private applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
    const result = { ...config };
    if (process.env['ANTHROPIC_API_KEY']) {
      result['anthropicApiKey'] = process.env['ANTHROPIC_API_KEY'];
    }
    if (process.env['OPENAI_API_KEY']) {
      result['openaiApiKey'] = process.env['OPENAI_API_KEY'];
    }
    return result;
  }

  private async ensureConfigDir(): Promise<void> {
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }
  }
}

export const configManager = new ConfigManager();
