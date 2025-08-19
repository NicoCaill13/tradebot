// src/lib/planner.ts
import type { Bar } from '../types.js';
import { daily, intraday60m, to4h } from './history.js';
import { sma, atr } from './indicators.js';

const LOOKBACK_DAILY = 60;        // jours de daily
const LOOKBACK_60M   = 20;        // jours d'intraday 60m (history.ts mappe vers '1mo')
const ENTRY_BUFFER_PCT = 0.001;   // +0,10% au-dessus du plus haut d’hier
const TP1_MULT = 1.5;
const TP2_MAX_MULT = 3.0;
const MIN_BUFFER_ABS = 0.02;      // $ mini sous SMA7 1H
const ATR_FRAC_FOR_BUFFER = 0.25; // buffer dyn = 0.25 * ATR14(1H)
const TP2_RESIST_BUFFER = 0.02;   // front-run sous résistance 4H

export type TradePlan = {
  ticker: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  r: number;
  shares: number;
  notional: number;
  risk$: number;
  ref: {
    yHigh: number; yLow: number; yClose: number; yDate: string;
    sma7_1h?: number; atr14_1h?: number; resist4h?: number | null;
  };
};

function yhlFromDaily(barsDaily: Bar[]) {
  if (!barsDaily?.length) return null;
  const last = barsDaily[barsDaily.length - 1];
  const yHigh = Number(last.high);
  const yLow  = Number(last.low);
  const yClose= Number(last.close);
  const yDate = (last.date instanceof Date ? last.date.toISOString() : String(last.date));
  if (![yHigh, yLow, yClose].every(Number.isFinite)) return null;
  return { yHigh, yLow, yClose, yDate };
}

function nearest4hResistanceAbove(entry: number, bars4h: Bar[], lookback = 180): number | null {
  if (!bars4h?.length) return null;
  const n = Math.min(lookback, bars4h.length);
  let best: number | null = null;
  for (let i = 1; i < n - 1; i++) {
    const h0 = Number(bars4h[i - 1].high);
    const h1 = Number(bars4h[i].high);
    const h2 = Number(bars4h[i + 1].high);
    if (![h0, h1, h2].every(Number.isFinite)) continue;
    const isSwingHigh = h1 > h0 && h1 > h2;
    if (!isSwingHigh) continue;
    if (h1 > entry) {
      if (best == null || h1 < best) best = h1;
    }
  }
  return best;
}

function round2(x: number) { return Math.round(x * 100) / 100; }
function round4(x: number) { return Math.round(x * 10000) / 10000; }

export async function buildTradePlan(
  ticker: string,
  capital: number,
  riskPct = 0.01,
  debug = false
): Promise<TradePlan | null> {

  // 1) Daily pour YHigh/YLow
  const dBars: Bar[] = await daily(ticker, LOOKBACK_DAILY).catch(() => []);
  if (!dBars.length) { if (debug) console.warn(`[plan] ${ticker}: daily vide`); return null; }
  const yd = yhlFromDaily(dBars);
  if (!yd) { if (debug) console.warn(`[plan] ${ticker}: YHigh/YLow invalides`); return null; }

  // 2) 60m (via history.ts → ranges Yahoo valides) pour SMA7, ATR14 et 4H synthé
  const m60: Bar[] = await intraday60m(ticker, LOOKBACK_60M).catch(() => []);
  let sma7_1h: number | undefined;
  let atr14_1h: number | undefined;
  let resist4h: number | null = null;

  if (m60.length) {
    const closes = m60.map(b => Number(b.close));
    const highs  = m60.map(b => Number(b.high));
    const lows   = m60.map(b => Number(b.low));

    const s7 = sma(closes, 7);
    sma7_1h = s7[s7.length - 1];

    const a14 = atr(highs, lows, closes, 14);
    atr14_1h = a14[a14.length - 1];

    const h4 = to4h(m60);
    const entryProbe = yd.yHigh * (1 + ENTRY_BUFFER_PCT);
    resist4h = nearest4hResistanceAbove(entryProbe, h4, 180);
  } else if (debug) {
    console.warn(`[plan] ${ticker}: 60m indisponible (fallback stop=YLow-0.1% si besoin)`);
  }

  // 3) Entry & Stop
  const entry = yd.yHigh * (1 + ENTRY_BUFFER_PCT);

  let stop: number;
  if (Number.isFinite(sma7_1h)) {
    const dynBuf = Number.isFinite(atr14_1h) ? (atr14_1h as number) * ATR_FRAC_FOR_BUFFER : 0;
    const buf = Math.max(MIN_BUFFER_ABS, dynBuf);
    stop = (sma7_1h as number) - buf;
  } else {
    // fallback si pas de 60m : sous le plus bas d’hier avec petite marge
    stop = yd.yLow * (1 - 0.001);
  }

  if (!(stop < entry)) {
    stop = yd.yLow * (1 - 0.003);
    if (!(stop < entry)) {
      if (debug) console.warn(`[plan] ${ticker}: stop>=entry après fallback`);
      return null;
    }
  }

  const r = entry - stop;

  // 4) TP
  const tp1 = entry + TP1_MULT * r;
  let tp2  = entry + TP2_MAX_MULT * r;
  if (resist4h != null && resist4h > entry) {
    tp2 = Math.min(tp2, resist4h - TP2_RESIST_BUFFER);
  }

  // 5) Sizing
  const risk$  = capital * riskPct;
  let shares   = Math.floor(risk$ / r);
  if (!Number.isFinite(shares) || shares < 1) shares = 1;

  const notional = shares * entry;
  const riskAbs  = shares * r;

  return {
    ticker,
    entry: round2(entry),
    stop:  round2(stop),
    tp1:   round2(tp1),
    tp2:   round2(tp2),
    r:     round4(r),
    shares,
    notional: round2(notional),
    risk$:    round2(riskAbs),
    ref: {
      yHigh: yd.yHigh, yLow: yd.yLow, yClose: yd.yClose, yDate: yd.yDate,
      sma7_1h, atr14_1h, resist4h,
    },
  };
}
