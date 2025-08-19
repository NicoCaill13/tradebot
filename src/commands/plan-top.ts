// src/commands/plan-top.ts
import fs from 'node:fs/promises';
import path from 'node:path';

import {buildDiscover} from '../lib/discover.js';
import { daily } from '../lib/history.js';
import { rsi } from '../lib/indicators.js';
import { buildTradePlan } from '../lib/planner.js';
import type { Bar } from '../types.js';

// ====== Config immuable (même scoring que plan.ts) ======
const TOP_N = Number(process.env.PLAN_TOP_N ?? 10); // nb de tickers à détailler
const PLAN_ALL = String(process.env.PLAN_ALL ?? '').toLowerCase() === 'true';

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
  const c = Number(b.close), h = Number(b.high), l = Number(b.low);
  if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(l) || c <= 0) return 0;
  return ((h - l) / c) * 100;
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function scoreRow(row: Row) {
  const { close, yHigh, rangePct, rsi14, vol } = row;

  // Breakout readiness (40%): plus proche de YHigh, mieux c'est (tunnel 5%)
  const gap = (yHigh - close) / yHigh;
  let sBreakout: number;
  if (!Number.isFinite(gap)) sBreakout = 0;
  else if (gap <= 0) sBreakout = 1;
  else sBreakout = clamp01(1 - gap / 0.05);

  // RSI sweet spot (25%): apex 62.5, 0 aux bords 45..80
  const apex = 62.5, left = 45, right = 80;
  let sRSI: number;
  if (rsi14 <= left || rsi14 >= right) sRSI = 0;
  else if (rsi14 <= apex) sRSI = clamp01((rsi14 - left) / (apex - left));
  else sRSI = clamp01((right - rsi14) / (right - apex));

  // Range “sain” (20%): apex 7%, 0 à 0% et 25%
  const cRange = 7, rMin = 0, rMax = 25;
  const d = Math.abs(rangePct - cRange);
  const sRange = clamp01(1 - d / (cRange - rMin)) * (rangePct <= rMax ? 1 : 0);

  // Liquidité (15%): log-normalisation entre 1e5 et 1e7
  const v = Math.max(1, vol);
  const sLiq = clamp01((Math.log10(v) - 5) / (7 - 5));

  const wBreak = 0.40, wRSI = 0.25, wRange = 0.20, wLiq = 0.15;
  const total = wBreak * sBreakout + wRSI * sRSI + wRange * sRange + wLiq * sLiq;

  row.score = total;
  row.parts = { sBreakout, sRSI, sRange, sLiq };
  return total;
}

function f2(n: number) { return Number(n).toFixed(2); }
function f4(n: number) { return Number(n).toFixed(4); }
function fmtMoney(n: number) { return Number(n).toFixed(2); }

export async function runPlanTop() {
  const capital = Number(process.env.CAPITAL_DEFAULT ?? 1000);
  const riskPct = Number(process.env.RISK_PER_TRADE_PCT ?? 0.01);
  const entryLimitBuf = Number(process.env.ENTRY_LIMIT_BUFFER_PCT ?? 0.001); // +0.10%
  const outDir = process.env.OUT_DIR || 'out';
  const debug = String(process.env.DEBUG_PLAN || '') === '1';

  // 1) Univers (même logique que plan.ts)
  const tickers: string[] = await buildDiscover();
  if (!tickers.length) {
    console.log('Aucun titre dans l’univers.');
    return;
  }

  // 2) Scoring (RSI>40 + calcul des métriques) — identique à plan.ts
  const rows: Row[] = [];
  for (const t of tickers) {
    const ticker = t.toUpperCase();
    try {
      const bars = await daily(ticker, 60);
      if (!bars.length) continue;
      const last = bars[bars.length - 1];
      const rsiArr = rsi(bars.map(b => Number(b.close)), 14);
      const rsi14 = rsiArr[rsiArr.length - 1];
      if (!Number.isFinite(rsi14) || rsi14 <= 40) continue;

      const row: Row = {
        ticker,
        rsi14,
        close: Number(last.close),
        vol: Number(last.volume ?? 0),
        rangePct: rangePctFromBar(last),
        yHigh: Number(last.high),
        yLow: Number(last.low),
        score: 0,
        parts: { sBreakout: 0, sRSI: 0, sRange: 0, sLiq: 0 },
      };
      scoreRow(row);
      rows.push(row);
    } catch {
      // ignore
    }
  }

  if (!rows.length) {
    console.log('Aucun titre éligible (RSI>40) pour détailler des ordres.');
    return;
  }

  // 3) Sélection : TOP_N ou ALL
  rows.sort((a, b) => b.score - a.score);
  const chosen = PLAN_ALL ? rows : rows.slice(0, Math.min(TOP_N, rows.length));

  // 4) Construction des plans détaillés (ENTRY/STOP/TP/QTY) via planner
  const lines: string[] = [];
  const today = ymd(new Date());
  console.log(`ORDRES DÉTAILLÉS — ${today} (capital=${capital}, risk=${(riskPct * 100).toFixed(2)}%)`);
  console.log('LÉGENDE : BUY STOP-LIMIT | ENTRY (YHigh+0.10%) | STOP (SMA7 1H - buffer) | TP1/TP2 = 1.5R/3R | QTY | NOTIONAL | RISK$');

  for (const r of chosen) {
    const plan = await buildTradePlan(r.ticker, capital, riskPct, debug).catch(() => null);
    if (!plan) {
      const msg = `// ${r.ticker}: pas de plan (données insuffisantes ou stop>=entry après fallback)`;
      console.log(msg);
      lines.push(msg);
      continue;
    }

    const limit = plan.entry * (1 + entryLimitBuf);
    const row =
      `BUY STOP-LIMIT ${plan.ticker.padEnd(6)} | QTY ${String(plan.shares).padStart(4)} ` +
      `| ENTRY ${f4(plan.entry)} | LIMIT ${f4(limit)} | STOP ${f4(plan.stop)} ` +
      `| TP1 ${f4(plan.tp1)} | TP2 ${f4(plan.tp2)} | R ${f4(plan.r)} ` +
      `| NOTIONAL ${fmtMoney(plan.notional)} | RISK$ ${fmtMoney(plan.risk$)} ` +
      `| // YHigh ${f4(plan.ref.yHigh)} | YLow ${f4(plan.ref.yLow)} ` +
      (plan.ref.sma7_1h ? `| SMA7_1H ${f4(plan.ref.sma7_1h)} ` : '') +
      (plan.ref.atr14_1h ? `| ATR14_1H ${f4(plan.ref.atr14_1h)} ` : '') +
      (plan.ref.resist4h ? `| R4H ${f4(plan.ref.resist4h)} ` : '');

    console.log(row);
    lines.push(row);
  }

  // 5) Sauvegarde
  try {
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `orders-${today}.txt`);
    await fs.writeFile(file, lines.join('\n'));
    console.log(`\nOrdres enregistrés → ${file}`);
  } catch {
    // silencieux
  }
}
