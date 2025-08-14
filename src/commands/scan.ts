import { yahoo } from '../types.js';
import { intraday } from '../lib/history.js';
import { ema, atr, vwap, rvol } from '../lib/indicators.js';
import {
  TODAY, ENTRY_MKT_THRESHOLD_PCT, OPENING_RANGE_MIN, TP_R_MULT_1, TP_R_MULT_2, STOP_ATR_MULT,
  CAPITAL_DEFAULT, CAPITAL_SYNC_WITH_ENV, RISK_PER_TRADE_PCT
} from '../settings.js';
import { writePlan } from '../lib/io.js';

type PlanRow = {
  ticker: string; entry: number; stop: number; tp1: number; tp2: number; shares: number; why: string;
};

export async function runScan(tickers: string[]) {
  const capital = CAPITAL_SYNC_WITH_ENV ? CAPITAL_DEFAULT : CAPITAL_DEFAULT;
  const rows: PlanRow[] = [];

  for (const t of tickers) {
    try {
      const [q, s]: any = await Promise.all([
        yahoo.quote(t),
        yahoo.quoteSummary(t, { modules: ['summaryDetail'] }),
      ]);
      const bars = await intraday(t, 2, '1m');
      const todayBars = bars.filter(b => new Date(b.date).toDateString() === new Date().toDateString());
      if (todayBars.length < 50) continue;

      const closes = todayBars.map(b=>b.close);
      const highs  = todayBars.map(b=>b.high);
      const lows   = todayBars.map(b=>b.low);
      const vols   = todayBars.map(b=>b.volume);

      const ema9  = ema(closes, 9);
      const ema20 = ema(closes, 20);
      const a14   = atr(highs, lows, closes, 14);
      const vwapArr = vwap(closes, vols);
      const rvolArr = rvol(vols, 20);

      // Opening Range (premières N minutes)
      const barsPerMin = 1; // on est en 1m
      const orCount = Math.min(OPENING_RANGE_MIN * barsPerMin, todayBars.length);
      const orHigh = Math.max(...todayBars.slice(0, orCount).map(b=>b.high));
      const orLow  = Math.min(...todayBars.slice(0, orCount).map(b=>b.low));

      const last = closes.at(-1)!;
      const lastRVOL = rvolArr.at(-1)!;
      const lastEMA9 = ema9.at(-1)!;
      const lastEMA20= ema20.at(-1)!;
      const lastVWAP = vwapArr.at(-1)!;
      const lastATR  = a14.at(-1)!;

      // Signal : Breakout OR + structure intraday (EMA9>EMA20, last>VWAP) + RVOL>1.2
      const breakout = last > orHigh && lastEMA9 > lastEMA20 && last > lastVWAP && lastRVOL >= 1.2;
      if (!breakout) continue;

      const entry = Math.max(orHigh, last); // rentrer sur dépassement
      const stop  = Math.min(orLow, entry - STOP_ATR_MULT * lastATR);
      const R = entry - stop;
      if (R <= 0) continue;

      const tp1 = entry + TP_R_MULT_1 * R;
      const tp2 = entry + TP_R_MULT_2 * R;

      const risk$ = capital * RISK_PER_TRADE_PCT;
      const shares = Math.max(0, Math.floor(risk$ / R));

      const diffPct = Math.abs((last - entry) / entry);
      const mkt = diffPct <= ENTRY_MKT_THRESHOLD_PCT;

      const why = `OR breakout, EMA9>EMA20, >VWAP, RVOL=${lastRVOL.toFixed(2)} ${mkt?'MKT':'LMT'}`;
      rows.push({ ticker: t, entry, stop, tp1, tp2, shares, why });
    } catch { /* ignore symbol */ }
  }

  // Output plan
  if (!rows.length) {
    console.log(`Aucun setup détecté aujourd'hui (${TODAY}).`);
    return;
  }

  const lines: string[] = [];
  lines.push(`DAY PLAN — ${TODAY}`);
  for (const r of rows) {
    const ord = `BUY ${r.ticker} ${r.shares} @ ${r.entry.toFixed(4)}  // STOP ${r.stop.toFixed(4)} | TP1 ${r.tp1.toFixed(4)} | TP2 ${r.tp2.toFixed(4)} | ${r.why}`;
    lines.push(ord);
  }
  const outFile = await writePlan(`plan-${TODAY}.txt`, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nPlan enregistré → ${outFile}`);
}
