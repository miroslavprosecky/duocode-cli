import { configManager } from './config-manager.js';
import { printHeader, printSuccess, printError, printWarning, printKeyValue } from '../ui/terminal.js';
import { askInput, askChoice, askConfirm } from '../ui/prompt-input.js';
import { createSpinner } from '../ui/spinner.js';
import { ClaudeAdapter } from '../models/claude-adapter.js';
import { CodexAdapter } from '../models/codex-adapter.js';
import type { SupervisionMode } from '../models/types.js';

export async function runSetupWizard(): Promise<void> {
  printHeader('DuoCode Setup Wizard');

  console.log('Configure your API keys and preferences.\n');

  // Anthropic API key
  const anthropicKey = await askInput('Enter your Anthropic API key (sk-ant-...)');
  if (!anthropicKey) {
    printError('Anthropic API key is required');
    return;
  }

  // Validate Anthropic key
  const anthropicSpinner = createSpinner('Validating Anthropic API key...');
  anthropicSpinner.start();
  const claudeAdapter = new ClaudeAdapter(anthropicKey);
  const anthropicValid = await claudeAdapter.validateApiKey();
  if (anthropicValid) {
    anthropicSpinner.succeed('Anthropic API key is valid');
  } else {
    anthropicSpinner.fail('Invalid Anthropic API key');
    printWarning('Continuing anyway – you can fix this later with `duocode config`');
  }

  // OpenAI API key
  const openaiKey = await askInput('Enter your OpenAI API key (sk-...)');
  if (!openaiKey) {
    printError('OpenAI API key is required');
    return;
  }

  // Validate OpenAI key
  const openaiSpinner = createSpinner('Validating OpenAI API key...');
  openaiSpinner.start();
  const codexAdapter = new CodexAdapter(openaiKey);
  const openaiValid = await codexAdapter.validateApiKey();
  if (openaiValid) {
    openaiSpinner.succeed('OpenAI API key is valid');
  } else {
    openaiSpinner.fail('Invalid OpenAI API key');
    printWarning('Continuing anyway – you can fix this later with `duocode config`');
  }

  // Claude model
  const claudeModel = await askChoice('Select Claude model', [
    { name: 'Claude Sonnet 4.6 (recommended)', value: 'claude-sonnet-4-6' },
    { name: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
    { name: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
  ]);

  // Codex model
  const codexModel = await askChoice('Select OpenAI model for supervision', [
    { name: 'GPT-5.3 Codex (recommended)', value: 'gpt-5.3-codex' },
    { name: 'GPT-5.2', value: 'gpt-5.2' },
    { name: 'GPT-5.2 Pro', value: 'gpt-5.2-pro' },
    { name: 'GPT-4o', value: 'gpt-4o' },
    { name: 'o3', value: 'o3' },
  ]);

  // Supervision mode
  const supervisionMode = await askChoice('Select supervision mode', [
    { name: 'Issues only – Codex comments only on problems (recommended)', value: 'issues-only' },
    { name: 'Always – Full review after every step', value: 'always' },
    { name: 'Never – No supervision', value: 'never' },
  ]) as SupervisionMode;

  // Forward analysis mode
  const forwardAnalysis = await askChoice('Forward Codex analysis to Claude', [
    { name: 'Confirm – Ask before forwarding (recommended)', value: 'confirm' },
    { name: 'Auto – Always forward without asking', value: 'auto' },
  ]) as 'auto' | 'confirm';

  // Save config
  await configManager.save({
    anthropicApiKey: anthropicKey,
    openaiApiKey: openaiKey,
    claudeModel,
    codexModel,
    supervisionMode,
    maxSteps: 20,
    tokenBudget: 100000,
    autoCommit: false,
    theme: 'dark',
    forwardAnalysis,
  });

  console.log('');
  printSuccess('Configuration saved!');
  const configPath = await configManager.getConfigPath();
  printKeyValue('Config file', configPath);
  console.log('\nRun `duocode ask "your prompt"` to get started.');
}
