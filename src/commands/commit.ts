// src/commands/commit.ts
// Emits human-friendly BUY orders for today from the current auto watchlist
// Uses the same sizing & entry logic as scan, and writes a .txt in out/
import YahooFinance from 'yahoo-finance2';
import { promises as fs } from 'fs';
import path from 'path';

import { MICROCAP_LIMIT } from '../constants.js';
import { TODAY } from '../env.js';
import { ema, atr } from '../indicators.js';
  import { loadState } from '../state.js';
import { dailyQuotes } from '../lib/history.js';
import { sizeByPortfolio } from '../lib/sizing.js';
import { SIZING_RISK_PCT, SIZING_TARGET_WEIGHT, ENTRY_MARKET_THRESHOLD_PCT } from '../settings.js';

const fmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);
const yahoo = new (YahooFinance as any)();

export async function runCommit() {
  const wlPath = path.join(process.cwd(), 'watchlist.txt');
  const raw = await fs.readFile(wlPath, 'utf8').catch(() => '');
  const tickers = raw.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim().toUpperCase()).filter(s => s && !s.startsWith('#'));

  if (!tickers.length) {
    console.log('watchlist.txt est vide. Lance d\'abord `discover`.');
    return;
  }

  // Capital & cash
  const state = await loadState();
  const capitalUSD = state.capital;
  const held = Object.values(state.positions).filter(p => p.shares > 0);
  let mtm = 0;
  if (held.length) {
    const quotes = await Promise.all(held.map(p => yahoo.quote(p.ticker) as Promise<any>));
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
        yahoo.quoteSummary(t, { modules: ['price', 'summaryDetail'] })
      ]);
      const price = Number(q?.regularMarketPrice ?? 0);
      const cap = Number(s?.price?.marketCap ?? q?.marketCap ?? 0);
      const adv = Number(s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? 0);
      if (!price || price < 1 || !adv || adv < 100_000 || !cap || cap > MICROCAP_LIMIT) continue;


      const hist = await dailyQuotes(t);

      if (!hist || hist.length < 50) continue;
      const closes = hist.map(h => h.close);
      const highs  = hist.map(h => h.high);
      const lows   = hist.map(h => h.low);

      const e20 = ema(closes, 20).at(-1)!;
      const a14 = atr(highs, lows, closes, 14).at(-1)!;

      const entry = Math.min(price, Math.max(e20, price * 0.98));
      const stop  = Math.max(0.01, entry - 2 * a14);
      const tp1   = entry + 1.5 * (entry - stop);
      const tp2   = entry + 3.0 * (entry - stop);

      const { shares } = sizeByPortfolio({ 
        capitalUSD, 
        availableCashUSD, 
        entry, 
        stop, 
        adv3m: adv,
        targetWeight: SIZING_TARGET_WEIGHT,
        riskPct: SIZING_RISK_PCT, });
      if (shares <= 0) continue;

      const diffPct = Math.abs((price - entry) / entry);
      const useMarket = Number.isFinite(diffPct) && diffPct <= ENTRY_MARKET_THRESHOLD_PCT;

      const ord = useMarket
        ? `BUY ${t} ${shares} @ MKT`
        : `BUY ${t} ${shares} LIMIT @ ${fmt(entry)}`;

      const risk = (entry - stop) * shares;
      const note = `// stop ${fmt(stop)}, TP1 ${fmt(tp1)}, TP2 ${fmt(tp2)}, risk≈$${risk.toFixed(2)}`;

      lines.push(`${ord}   ${note}`);
    } catch {
      // skip on error
    }
  }

  if (lines.length <= 3) {
    lines.push('(Aucun ordre BUY généré aujourd\'hui)');
  }

  const outDir = path.join(process.cwd(), 'out');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `buy-orders-${TODAY}.txt`);
  await fs.writeFile(outPath, lines.join(''));

  console.log(lines.join(''));
  console.log(`Fichier ordres → ${outPath}`);
}
