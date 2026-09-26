#!/usr/bin/env node
import { run } from './cli/run.ts';

run(process.argv.slice(2), process).then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
);
