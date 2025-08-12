#!/usr/bin/env -S node --no-warnings
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function main() {
  return yargs(hideBin(process.argv))
    .scriptName('mpb')
    .command(
      'run',
      'Run daily decision engine',
      (y) =>
        y
          .option('capital', { type: 'number', describe: 'Override capital (USD)' })
          .option('assume-fills', { type: 'boolean', default: false }),
      async (argv) => {
        const { runEngine } = await import('./commands/run.js');
        await runEngine({
          capital: argv.capital as number | undefined,
          assumeFills: Boolean((argv as any)['assume-fills'] ?? (argv as any).assumeFills),
        });
      }
    )
    .command(
      'status',
      'Show clear STOPs and Take-Profits per ticker and export JSON',
      () => {},
      async () => {
        const { runStatus } = await import('./commands/status.js');
        await runStatus();
      }
    )
    .command(
      'targets',
      'Show take-profit target prices and share quantities per ticker',
      () => {},
      async () => {
        const { runTargets } = await import('./commands/targets.js');
        await runTargets();
      }
    )
    .command(
      'scan',
      'Scan a watchlist and propose Entry / STOP / TPs per ticker with auto-sizing (strategy-decided)',
      () => {},
      async () => {
        const { runScan } = await import('./commands/scan.js');
        await runScan();
      }
    )
    .command(
      'discover',
      'Auto-build a US micro-cap watchlist (writes watchlist.txt)',
      () => {},
      async () => {
        const { runDiscover } = await import('./commands/discover.js');
        await runDiscover();
      }
    )
    .command(
      'commit',
      'Emit human-friendly BUY orders for today based on discover/scan logic',
      () => {},
      async () => {
        const { runCommit } = await import('./commands/commit.js');
        await runCommit();
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
