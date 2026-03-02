#!/usr/bin/env node

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
