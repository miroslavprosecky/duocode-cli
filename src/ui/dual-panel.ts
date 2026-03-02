import chalk from 'chalk';
import boxen, { type Options as BoxenOptions } from 'boxen';
import type { AnalysisResult } from '../models/types.js';
import { modelLabel } from './attribution.js';

const MIN_SIDE_BY_SIDE_WIDTH = 120;

export function displaySingleAnalysis(result: AnalysisResult): void {
  const content = formatAnalysisContent(result);
  const color = result.role === 'implementor' ? 'magenta' : 'green';
  const width = Math.min((process.stdout.columns || 80) - 2, 78);

  console.log(boxen(content, {
    title: modelLabel(result.model, result.role),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: color,
    width,
  }));
  console.log('');
}

export function displayDualAnalysis(claude: AnalysisResult, codex: AnalysisResult): void {
  const terminalWidth = process.stdout.columns || 80;

  if (terminalWidth >= MIN_SIDE_BY_SIDE_WIDTH) {
    displaySideBySide(claude, codex, terminalWidth);
  } else {
    displayStacked(claude, codex, terminalWidth);
  }
}

function formatAnalysisContent(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(result.content);

  if (result.reasoning) {
    lines.push('');
    lines.push(chalk.dim.italic('Reasoning:'));
    lines.push(chalk.dim(result.reasoning));
  }

  if (result.suggestedActions && result.suggestedActions.length > 0) {
    lines.push('');
    lines.push(chalk.dim.italic('Suggested Actions:'));
    for (const action of result.suggestedActions) {
      lines.push(chalk.dim(`  - ${action}`));
    }
  }

  if (result.tokenUsage) {
    lines.push('');
    lines.push(
      chalk.dim(
        `Tokens: ${result.tokenUsage.input ?? '?'} in / ${result.tokenUsage.output ?? '?'} out`,
      ),
    );
  }

  return lines.join('\n');
}

function displaySideBySide(
  claude: AnalysisResult,
  codex: AnalysisResult,
  terminalWidth: number,
): void {
  const panelWidth = Math.floor(terminalWidth / 2) - 3;

  const claudeContent = formatAnalysisContent(claude);
  const codexContent = formatAnalysisContent(codex);

  const claudeBoxOptions: BoxenOptions = {
    title: modelLabel(claude.model, claude.role),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 0, bottom: 0, left: 0, right: 1 },
    borderStyle: 'round',
    borderColor: 'magenta',
    width: panelWidth,
  };

  const codexBoxOptions: BoxenOptions = {
    title: modelLabel(codex.model, codex.role),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: 'green',
    width: panelWidth,
  };

  const claudeBox = boxen(claudeContent, claudeBoxOptions);
  const codexBox = boxen(codexContent, codexBoxOptions);

  const claudeLines = claudeBox.split('\n');
  const codexLines = codexBox.split('\n');
  const maxLines = Math.max(claudeLines.length, codexLines.length);

  const output: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const left = claudeLines[i] ?? ' '.repeat(panelWidth);
    const right = codexLines[i] ?? '';
    output.push(`${left}${right}`);
  }

  console.log('');
  console.log(output.join('\n'));
  console.log('');
}

function displayStacked(
  claude: AnalysisResult,
  codex: AnalysisResult,
  terminalWidth: number,
): void {
  const panelWidth = Math.min(terminalWidth - 2, 78);

  const claudeContent = formatAnalysisContent(claude);
  const codexContent = formatAnalysisContent(codex);

  const claudeBox = boxen(claudeContent, {
    title: modelLabel(claude.model, claude.role),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: 'magenta',
    width: panelWidth,
  });

  const codexBox = boxen(codexContent, {
    title: modelLabel(codex.model, codex.role),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: 'green',
    width: panelWidth,
  });

  console.log(claudeBox);
  console.log(codexBox);
  console.log('');
}
