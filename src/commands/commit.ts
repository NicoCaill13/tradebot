
import { promises as fs } from 'fs';
import path from 'path';

import { MICROCAP_LIMIT } from '../constants.js';
import { TODAY, OUT_DIR } from '../env.js';
import { ema, atr } from '../indicators.js';
import { loadState } from '../state.js';

import { FILTER_MIN_PRICE, FILTER_MIN_ADV_3M } from '../settings.js';
import { loadWatchlist } from '../lib/io.js';
import { dailyQuotes } from '../lib/history.js';
import { computeEntry, computeStop, computeTPs, decideAction } from '../lib/entry.js';
import { decideSizeWithDefaults } from '../lib/sizing.js';

import { yahoo } from '../utils.js';

const fmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);

export async function runCommit() {
  const tickers = await loadWatchlist('watchlist.txt');
  if (!tickers.length) {
    console.log("watchlist.txt est vide. Lance d'abord `discover`.");
    return;
  }

  // Capital & cash
  const state = await loadState();
  const capitalUSD = state.capital;
  const held = Object.values(state.positions).filter((p) => p.shares > 0);
  let mtm = 0;
  if (held.length) {
    const quotes = await Promise.all(held.map((p) => yahoo.quote(p.ticker) as Promise<any>));
    for (let i = 0; i < held.length; i++) {
      const px = quotes[i]?.regularMarketPrice ?? 0;
      mtm += (px || 0) * held[i].shares;
    }
  }
  const availableCashUSD = Math.max(0, capitalUSD - mtm);

  const lines: string[] = [];
  lines.push(`BUY ORDERS — ${TODAY}`);
  lines.push(`Capital: $${capitalUSD.toFixed(2)} | Cash approx: $${availableCashUSD.toFixed(2)}`);
  lines.push('');

  for (const t of tickers) {
    try {
      const [q, s]: any = await Promise.all([
        yahoo.quote(t),
        yahoo.quoteSummary(t, { modules: ['price', 'summaryDetail'] }),
      ]);
      const price = Number(q?.regularMarketPrice ?? 0);
      const cap = Number(s?.price?.marketCap ?? q?.marketCap ?? 0);
      const adv = Number(
        s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? 0,
      );
      if (!price || price < FILTER_MIN_PRICE || !adv || adv < FILTER_MIN_ADV_3M || !cap || cap > MICROCAP_LIMIT) {
        continue;
      }

      const hist = await dailyQuotes(t, 6);
      if (!hist || hist.length < 50) continue;
      const closes = hist.map((h) => h.close);
      const highs = hist.map((h) => h.high);
      const lows = hist.map((h) => h.low);

      const e20 = ema(closes, 20).at(-1)!;
      const a14 = atr(highs, lows, closes, 14).at(-1)!;

      const entry = computeEntry(price, e20);
      const stop  = computeStop(entry, a14);
      const { tp1, tp2 } = computeTPs(entry, stop);

      const { shares } = decideSizeWithDefaults({
        capitalUSD,
        availableCashUSD,
        entry,
        stop,
        adv3m: adv,
      });
      if (shares <= 0) continue;

      const action = decideAction(price, entry);
      const risk = (entry - stop) * shares;

      const ord = action.includes('MKT')
        ? `BUY ${t} ${shares} @ MKT`
        : `BUY ${t} ${shares} LIMIT @ ${fmt(entry)}`;
      const note = `// stop ${fmt(stop)}, TP1 ${fmt(tp1)}, TP2 ${fmt(tp2)}, risk≈$${risk.toFixed(2)}`;

      lines.push(`${ord}   ${note}`);
    } catch {
      // skip
    }
  }

  if (lines.length <= 3) {
    lines.push("(Aucun ordre BUY généré aujourd'hui)");
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `buy-orders-${TODAY}.txt`);
  await fs.writeFile(outPath, lines.join('\n'));

  console.log(lines.join('\n'));
  console.log(`\nFichier ordres → ${outPath}`);
}
