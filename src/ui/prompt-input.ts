import { confirm, input, select } from '@inquirer/prompts';

export async function askConfirm(message: string, defaultVal: boolean = true): Promise<boolean> {
  const answer = await confirm({
    message,
    default: defaultVal,
  });

  return answer;
}

export async function askInput(message: string): Promise<string> {
  const answer = await input({
    message,
  });

  return answer;
}

export interface Choice {
  name: string;
  value: string;
  description?: string;
}

export async function askChoice(message: string, choices: Choice[]): Promise<string> {
  const answer = await select({
    message,
    choices: choices.map((c) => ({
      name: c.name,
      value: c.value,
      description: c.description,
    })),
  });

  return answer;
}
