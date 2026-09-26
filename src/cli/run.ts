import { Command } from '@commander-js/extra-typings';
import { NAME, VERSION } from '../version.ts';

export interface Io {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}

/** Runs the CLI and resolves to the process exit code. */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const program = new Command(NAME)
    .description('Weather in your terminal.')
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: text => io.stdout.write(text),
      writeErr: text => io.stderr.write(text),
    });
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof Error && 'exitCode' in error) {
      return typeof error.exitCode === 'number' ? error.exitCode : 1;
    }
    throw error;
  }
}
