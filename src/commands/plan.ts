// src/commands/plan.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Bar } from '../types.js';
import {buildDiscover} from '../lib/discover.js';
import { daily } from '../lib/history.js';
import { rsi } from '../lib/indicators.js';

const TOP_N = 10; // combien afficher en "TOP WATCH"

function ymd(d: Date | string) {
  const dt = new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type Row = {
  ticker: string;
  rsi14: number;
  close: number;
  vol: number;
  rangePct: number;
  yHigh: number;
  yLow: number;
  score: number;
  parts: { sBreakout: number; sRSI: number; sRange: number; sLiq: number };
};

function rangePctFromBar(b: Bar) {
  const c = Number(b.close);
  const h = Number(b.high);
  const l = Number(b.low);
  if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(l) || c <= 0) return 0;
  return ((h - l) / c) * 100;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** scoring immuable */
function scoreRow(row: Row) {
  const { close, yHigh, rangePct, rsi14, vol } = row;

  // 1) Breakout readiness: close proche de YHigh (tunnel 5%)
  const gap = (yHigh - close) / yHigh; // <0 si déjà au-dessus
  let sBreakout: number;
  if (!Number.isFinite(gap)) sBreakout = 0;
  else if (gap <= 0) sBreakout = 1;
  else sBreakout = clamp01(1 - gap / 0.05); // 0 à -5%

  // 2) RSI sweet spot: apex à 62.5, 0 aux bords (45..80)
  const apex = 62.5, left = 45, right = 80;
  let sRSI: number;
  if (rsi14 <= left || rsi14 >= right) sRSI = 0;
  else if (rsi14 <= apex) sRSI = clamp01((rsi14 - left) / (apex - left));
  else sRSI = clamp01((right - rsi14) / (right - apex));

  // 3) Range “sain”: apex 7%, 0 à 0% et 25%
  const cRange = 7, rMin = 0, rMax = 25;
  const d = Math.abs(rangePct - cRange);
  const sRange = clamp01(1 - d / (cRange - rMin)) * (rangePct <= rMax ? 1 : 0);

  // 4) Liquidité: log-normalisation entre 1e5 et 1e7
  const v = Math.max(1, vol);
  const sLiq = clamp01((Math.log10(v) - 5) / (7 - 5));

  // Poids
  const wBreak = 0.40, wRSI = 0.25, wRange = 0.20, wLiq = 0.15;
  const total = wBreak * sBreakout + wRSI * sRSI + wRange * sRange + wLiq * sLiq;

  row.score = total;
  row.parts = { sBreakout, sRSI, sRange, sLiq };
  return total;
}

function formatNum(n: number, d = 2) {
  return Number(n).toFixed(d);
}
function fmtPct(n: number) {
  return `${formatNum(n, 2)}%`;
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `${formatNum(n / 1_000_000, 2)}M`;
  if (n >= 1000) return `${formatNum(n / 1000, 1)}k`;
  return String(n);
}

export async function runPlan() {
  const tickers: string[] = await buildDiscover(); 
  if (!tickers.length) {
    console.log('Aucun titre dans l’univers.');
    return;
  }

  const rows: Row[] = [];
  for (const u of tickers) {
    const ticker = (typeof u === 'string' ? u : (u as any).ticker); 
    try {
      const bars = await daily(ticker, 60);
      if (!bars.length) continue;

      const last = bars[bars.length - 1];
      const closes = bars.map(b => Number(b.close));
      const r = rsi(closes, 14);
      const rsi14 = r[r.length - 1];
      if (!Number.isFinite(rsi14) || rsi14 <= 40) continue; 

      const yHigh = Number(last.high);
      const yLow = Number(last.low);
      const close = Number(last.close);
      const vol = Number(last.volume ?? 0);
      const rangePct = rangePctFromBar(last);

      const row: Row = {
        ticker,
        rsi14,
        close,
        vol,
        rangePct,
        yHigh,
        yLow,
        score: 0,
        parts: { sBreakout: 0, sRSI: 0, sRange: 0, sLiq: 0 },
      };
      scoreRow(row);
      rows.push(row);
    } catch {
      // ignore ticker en erreur
    }
  }

  if (!rows.length) {
    console.log('PLAN — Filtre unique: RSI(14) > 40\nAucun résultat.');
    return;
  }

  rows.sort((a, b) => b.score - a.score);

  const today = ymd(new Date());
  console.log(`PLAN ${today} — RSI(14) > 40 + Priorisation`);
  console.log(`TOP WATCH (${Math.min(TOP_N, rows.length)}) — priorité par score (Breakout 40%, RSI 25%, Range 20%, Liquidity 15%)`);
  for (const r of rows.slice(0, TOP_N)) {
    const { ticker, rsi14, close, vol, rangePct, yHigh, parts } = r;
    const gapPct = ((yHigh - close) / yHigh) * 100;
    console.log(
      `${ticker.padEnd(6)} | score ${formatNum(r.score, 3)} | RSI ${formatNum(rsi14, 1)} | close ${formatNum(close, 4)} | ` +
      `gapToYH ${fmtPct(gapPct)} | range ${fmtPct(rangePct)} | vol ${fmtK(vol)} | ` +
      `comp[BRK ${formatNum(parts.sBreakout*100,0)} | RSI ${formatNum(parts.sRSI*100,0)} | RNG ${formatNum(parts.sRange*100,0)} | LIQ ${formatNum(parts.sLiq*100,0)}]`
    );
  }

  console.log('\nLISTE COMPLÈTE (RSI>40) :');
  console.log('TICKER | RSI14 | CLOSE | VOL | RANGE%');
  for (const r of rows) {
    console.log(
      `${r.ticker.padEnd(6)} | ${formatNum(r.rsi14,1).padStart(5)} | ${formatNum(r.close,4).padEnd(8)} | ${fmtK(r.vol).padEnd(7)} | ${fmtPct(r.rangePct)}`
    );
  }

  // Sauvegarde du top
  const outDir = process.env.OUT_DIR || 'out';
  const file = path.join(outDir, `top-${today}.txt`);
  const lines: string[] = [];
  lines.push(`PLAN ${today} — TOP WATCH (RSI>40 + score)`);
  lines.push(`Critères: Breakout readiness (40%), RSI sweet spot (25%), Range sain (20%), Liquidité (15%)`);
  lines.push('');
  for (const r of rows.slice(0, TOP_N)) {
    const { ticker, rsi14, close, vol, rangePct, yHigh, parts } = r;
    const gapPct = ((yHigh - close) / yHigh) * 100;
    lines.push(
      `${ticker} | score ${formatNum(r.score,3)} | RSI ${formatNum(rsi14,1)} | close ${formatNum(close,4)} | ` +
      `gapToYH ${fmtPct(gapPct)} | range ${fmtPct(rangePct)} | vol ${fmtK(vol)} | comp[BRK ${formatNum(parts.sBreakout*100,0)} | RSI ${formatNum(parts.sRSI*100,0)} | RNG ${formatNum(parts.sRange*100,0)} | LIQ ${formatNum(parts.sLiq*100,0)}]`
    );
  }
  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(file, lines.join('\n'));
    console.log(`\nTop enregistré → ${file}`);
  } catch {
    // silencieux
  }

  console.log('\nAstuce: pour un ordre détaillé → `plan-ticker TICKER` (ex: plan-ticker PRTA)');
}
