#!/usr/bin/env node

// Suppress url.parse() deprecation warning from node-fetch (used internally by Anthropic/OpenAI SDKs)
{
  const origEmit = process.emit;
  // @ts-expect-error -- overriding emit to filter DeprecationWarning
  process.emit = function (event: string, ...args: unknown[]) {
    if (event === 'warning' && (args[0] as { name?: string })?.name === 'DeprecationWarning') {
      return false;
    }
    // @ts-expect-error -- forwarding to original emit
    return origEmit.apply(process, [event, ...args]);
  };
}

import { createCLI } from '../src/cli.js';
import { VERSION } from '../src/version.js';

const program = createCLI(VERSION);

process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

program.parseAsync(process.argv).catch((error) => {
  console.error('Fatal error:', error.message ?? error);
  process.exit(1);
});
