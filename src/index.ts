// src/index.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runPlan } from './commands/plan.js';
import { runPlanTicker } from './commands/plan-ticker.js';
import { runPlanTop } from './commands/plan-top.js';
import type { Argv } from 'yargs';


type ScanArgs = { list?: string };

async function main() {

  const cli = (yargs as any)(hideBin(process.argv));
  await cli
  .scriptName('daytrade-bot')
  .command(
    'plan-ticker <ticker>',
    'Plan PRTA-like pour un ticker (capital & risque depuis .env)',
    (y: Argv) =>
      y.positional('ticker', {
        type: 'string',
        demandOption: true,
        describe: 'Symbole (ex: PRTA)',
      }),
    async (args:any) => {
      await runPlanTicker(String(args.ticker));
    }
  )
    .command(
      'plan',
      'Génère un plan daily immuable',
      (y: ScanArgs) => y,
      async (_argv: unknown) => {
        await runPlan();
      }
    )
    .command('plan-top', 'Génère les ordres détaillés pour le TOP (ou ALL via env)',
    (y: ScanArgs) => y,
      async (_argv: unknown) => {
        await runPlanTop();
      })

    .demandCommand(1)
    .strict()
    .help()
    .parse();
}

main().catch((e) => { console.error(e); process.exit(1); });

