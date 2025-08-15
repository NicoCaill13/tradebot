// src/index.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runScan } from './commands/scan.js';
import { initYahooQuietly } from './lib/yf.js';

type ScanArgs = { list?: string };

async function main() {
  await initYahooQuietly();

  const cli = (yargs as any)(hideBin(process.argv));
  await cli
    .command(
      'scan',
      'Construit l’univers (si nécessaire) et génère le plan overnight US/EU',
      (y: any) => y.option('list', {
        type: 'string',
        describe: 'Tickers séparés par des virgules (ex: "JBLU,GPRO") pour override'
      }),
      async (args: ScanArgs) => {
        const tickers =
          typeof args.list === 'string' && args.list.trim()
            ? args.list.split(',').map((s: string) => s.trim().toUpperCase())
            : undefined; 
        await runScan(tickers);
      }
    )
    .demandCommand(1)
    .strict()
    .help()
    .parse();
}

main().catch((e) => { console.error(e); process.exit(1); });
