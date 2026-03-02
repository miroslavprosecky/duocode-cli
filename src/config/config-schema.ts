import { z } from 'zod';

export const configSchema = z.object({
  anthropicApiKey: z.string().min(1, 'Anthropic API key is required'),
  openaiApiKey: z.string().min(1, 'OpenAI API key is required'),
  claudeModel: z.string().default('claude-sonnet-4-6'),
  codexModel: z.string().default('gpt-5.3-codex'),
  supervisionMode: z.enum(['issues-only', 'always', 'never']).default('issues-only'),
  maxSteps: z.number().int().min(1).max(100).default(20),
  tokenBudget: z.number().int().min(1000).default(100000),
  autoCommit: z.boolean().default(false),
  theme: z.enum(['dark', 'light']).default('dark'),
  forwardAnalysis: z.enum(['auto', 'confirm']).default('confirm'),
});

export type ValidatedConfig = z.infer<typeof configSchema>;

export const partialConfigSchema = configSchema.partial();

export function validateConfig(data: unknown): ValidatedConfig {
  return configSchema.parse(data);
}

export function validatePartialConfig(data: unknown): Partial<ValidatedConfig> {
  return partialConfigSchema.parse(data);
}
