#!/usr/bin/env node
import { run } from './cli/run.ts';

// One Ctrl+C aborts requests and prompts cleanly; a second one exits at once.
const controller = new AbortController();
process.once('SIGINT', () => {
  controller.abort();
});

// `skycast now Paris --json | head -c 10` closes the pipe early. That is
// not an error worth a stack trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw error;
  });
}

run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
  platform: process.platform,
  signal: controller.signal,
}).then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exitCode = 1;
  }
);
