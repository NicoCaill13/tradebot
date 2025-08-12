// src/commands/discover.ts
// Builds an auto watchlist of US micro-caps using Yahoo Finance sources, then writes watchlist.txt

import { promises as fs } from 'fs';
import path from 'path';

import { MICROCAP_LIMIT } from '../constants.js';
import { ema } from '../indicators.js';
import { TODAY, OUT_DIR } from '../env.js';
import { FILTER_MIN_PRICE, FILTER_MIN_ADV_3M, FILTER_EXCH_REGEX } from '../settings.js';
import { dailyQuotes } from '../lib/history.js';
import {yahoo} from "../utils"

async function pullCandidates(): Promise<string[]> {
  const set = new Set<string>();
  try {
    const tr: any = await (yahoo as any).trendingSymbols('US');
    const list: any[] = tr?.quotes || tr?.symbols || tr || [];
    for (const q of list) {
      const t = (q.symbol || q.ticker || q).toString().toUpperCase();
      if (t) set.add(t);
    }
  } catch {}
  for (const scr of ['day_gainers', 'most_actives', 'undervalued_growth_stocks']) {
    try {
      const res: any = await (yahoo as any).screener({ scrIds: scr, count: 50 });
      const items: any[] = res?.finance?.result?.[0]?.quotes || res?.quotes || [];
      for (const it of items) {
        const t = (it.symbol || it.ticker || it).toString().toUpperCase();
        if (t) set.add(t);
      }
    } catch {}
  }
  return Array.from(set).slice(0, 80);
}

async function keepMicrocapUS(
  tickers: string[],
): Promise<{ ticker: string; price: number; cap: number; adv: number }[]> {
  const out: { ticker: string; price: number; cap: number; adv: number }[] = [];
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
      const exch = (q?.fullExchangeName || q?.exchange || '').toString();
      if (!price || price < FILTER_MIN_PRICE) continue;
      if (!cap || cap > MICROCAP_LIMIT) continue;
      if (!adv || adv < FILTER_MIN_ADV_3M) continue;
      if (!exch || !FILTER_EXCH_REGEX.test(exch)) continue;
      out.push({ ticker: t, price, cap, adv });
    } catch {}
  }
  return out;
}

async function scoreByTrend(
  cands: { ticker: string; price: number; cap: number; adv: number }[],
) {
  const out: any[] = [];
  for (const c of cands) {
    try {
      const hist = await dailyQuotes(c.ticker, 6);
      if (!hist || hist.length < 50) continue;
      const closes = hist.map((h) => h.close as number);
      const e20 = ema(closes, 20).at(-1)!;
      const e50 = ema(closes, 50).at(-1)!;
      const dist = (c.price - e20) / c.price;
      let score = 0;
      if (c.price > e20 && e20 > e50) score += 1;
      const pull = Math.max(0, Math.min(1, -dist / 0.02));
      score += pull;
      if (c.cap >= 50_000_000 && c.cap <= 200_000_000) score += 0.25;
      out.push({ ticker: c.ticker, price: c.price, cap: c.cap, adv: c.adv, ema20: e20, ema50: e50, dist20: dist, score });
    } catch {}
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export async function runDiscover() {
  console.log(`\n=== DISCOVER (auto watchlist) — ${TODAY} ===`);
  const seeds = await pullCandidates();
  if (!seeds.length) {
    console.log('Aucune seed trouvée (API screener indisponible). Ajoute quelques tickers manuellement.');
    return;
  }
  const micro = await keepMicrocapUS(seeds);
  if (!micro.length) {
    console.log('Aucun micro-cap éligible parmi les seeds.');
    return;
  }
  const ranked = await scoreByTrend(micro);
  const top = ranked.slice(0, 12);

  console.table(
    top.map((r) => ({
      Ticker: r.ticker,
      Price: r.price,
      'Cap ($)': r.cap,
      'ADV 3m': r.adv,
      'Dist to EMA20': `${(r.dist20 * 100).toFixed(1)}%`,
      Score: r.score.toFixed(2),
    })),
  );

  const wlPath = path.join(process.cwd(), 'watchlist.txt');
  await fs.writeFile(wlPath, top.map((r) => r.ticker).join('\n'));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `watchlist-${TODAY}.txt`);
  await fs.writeFile(outPath, top.map((r) => r.ticker).join('\n'));

  console.log(`\nWatchlist mise à jour → ${wlPath}`);
  console.log(`Copie enregistrée → ${outPath}\n`);
}
