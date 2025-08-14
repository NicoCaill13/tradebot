import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runDiscover } from './commands/discover.js';
import { runScan } from './commands/scan.js';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command('discover', 'Construit une watchlist US/EU (1–10$) selon .env', ()=>{}, async () => {
      const wl = await runDiscover();
      console.log(`Watchlist (${wl.length}) =>`, wl.join(', '));
    })
    .command('scan', 'Scanne la watchlist et génère un plan day-trade', y => y.option('list', {
      type:'string', describe:'Liste de tickers séparés par des virgules (override discover)'
    }), async (args) => {
      const tickers = typeof args.list === 'string' && args.list.trim()
        ? args.list.split(',').map(s=>s.trim().toUpperCase())
        : await runDiscover();
      await runScan(tickers);
    })
    .demandCommand(1)
    .strict()
    .help()
    .parse();
}

main().catch(e=>{ console.error(e); process.exit(1); });
