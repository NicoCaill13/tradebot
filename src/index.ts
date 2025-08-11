#!/usr/bin/env -S node --no-warnings
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runEngine } from './engine.js';

function main() {
  return yargs(hideBin(process.argv))
    .command(
      'run',
      'Run daily decision engine',
      (y) =>
        y
          .option('capital', { type: 'number', describe: 'Override capital (USD)' })
          .option('assume-fills', { type: 'boolean', default: false }),
      async (argv) => {
        await runEngine({
          capital: (argv.capital as number | undefined),
          assumeFills: Boolean(argv.assumeFills),
        });
      }
    )
    .demandCommand(1)
    .help()
    .strict()
    .parseAsync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
