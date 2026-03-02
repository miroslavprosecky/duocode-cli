import chalk from 'chalk';

export function claudeBadge(): string {
  return chalk.bgMagenta.white.bold(' Claude ');
}

export function codexBadge(): string {
  return chalk.bgGreen.white.bold(' Codex ');
}

export function modelLabel(name: string, role: string): string {
  const normalizedName = name.toLowerCase();

  let badge: string;
  if (normalizedName.includes('claude')) {
    badge = claudeBadge();
  } else if (normalizedName.includes('codex') || normalizedName.includes('o1') || normalizedName.includes('gpt')) {
    badge = codexBadge();
  } else {
    badge = chalk.bgBlue.white.bold(` ${name} `);
  }

  const roleLabel = chalk.dim(`(${role})`);

  return `${badge} ${roleLabel}`;
}
