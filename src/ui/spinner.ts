import ora, { type Ora } from 'ora';

export interface Spinner {
  start(text?: string): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  update(text: string): Spinner;
  isSpinning(): boolean;
}

class SpinnerWrapper implements Spinner {
  private readonly instance: Ora;

  constructor(text: string) {
    this.instance = ora({
      text,
      spinner: 'dots',
      color: 'cyan',
    });
  }

  start(text?: string): Spinner {
    if (text) {
      this.instance.text = text;
    }
    this.instance.start();
    return this;
  }

  stop(): Spinner {
    this.instance.stop();
    return this;
  }

  succeed(text?: string): Spinner {
    this.instance.succeed(text);
    return this;
  }

  fail(text?: string): Spinner {
    this.instance.fail(text);
    return this;
  }

  update(text: string): Spinner {
    this.instance.text = text;
    return this;
  }

  isSpinning(): boolean {
    return this.instance.isSpinning;
  }
}

const activeSpinners: Set<SpinnerWrapper> = new Set();

export function createSpinner(text: string): Spinner {
  // Stop any currently active spinner to prevent overlap
  for (const existing of activeSpinners) {
    if (existing.isSpinning()) {
      existing.stop();
    }
  }

  const spinner = new SpinnerWrapper(text);
  activeSpinners.add(spinner);

  // Wrap stop/succeed/fail to auto-clean from the set
  const originalStop = spinner.stop.bind(spinner);
  const originalSucceed = spinner.succeed.bind(spinner);
  const originalFail = spinner.fail.bind(spinner);

  spinner.stop = ((): Spinner => {
    activeSpinners.delete(spinner);
    return originalStop();
  }) as () => Spinner;

  spinner.succeed = ((t?: string): Spinner => {
    activeSpinners.delete(spinner);
    return originalSucceed(t);
  }) as (text?: string) => Spinner;

  spinner.fail = ((t?: string): Spinner => {
    activeSpinners.delete(spinner);
    return originalFail(t);
  }) as (text?: string) => Spinner;

  return spinner;
}
