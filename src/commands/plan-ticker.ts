// src/commands/plan-ticker.ts
import { buildTradePlan } from '../lib/planner.js';

function ymd(d: string | Date) {
  const dt = new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function numFromEnv(key: string, def: number): number {
  const v = process.env[key];
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

export async function runPlanTicker(ticker: string) {
  const capital = numFromEnv('CAPITAL_DEFAULT', 100);
  // Priorité à RISK_PER_TRADE_PCT (héritage de ton .env), fallback sur RISK_PCT, sinon 1%
  const riskPct =
    numFromEnv('RISK_PER_TRADE_PCT', NaN) ||
    numFromEnv('RISK_PCT', NaN) ||
    0.01;

  const plan = await buildTradePlan(ticker.toUpperCase(), capital, riskPct);
  if (!plan) {
    console.log(`Aucun plan construit pour ${ticker}.`);
    return;
  }

  const d = ymd(plan.ref.yDate);
  const head = `PLAN ${d} — ${plan.ticker} (breakout + stop SMA7 1H, TP1=1.5R, TP2 capé par R4H)`;
  const parts = [
    `BUY STOP ${plan.ticker}`,
    `ENTRY ${plan.entry.toFixed(2)}`,
    `STOP ${plan.stop.toFixed(2)}`,
    `TP1 ${plan.tp1.toFixed(2)}`,
    `TP2 ${plan.tp2.toFixed(2)}`,
    `R ${plan.r.toFixed(4)}`,
    `QTY ${plan.shares}`,
    `NOTIONAL ${plan.notional.toFixed(2)}`,
    `RISK$ ${plan.risk$.toFixed(2)}`,
    `// YHigh ${plan.ref.yHigh.toFixed(2)} | YLow ${plan.ref.yLow.toFixed(2)}`
  ];

  const extras = [
    plan.ref.sma7_1h != null ? `SMA7_1H ${plan.ref.sma7_1h.toFixed(2)}` : null,
    plan.ref.atr14_1h != null ? `ATR14_1H ${plan.ref.atr14_1h.toFixed(2)}` : null,
    plan.ref.resist4h != null ? `Res4H ${plan.ref.resist4h!.toFixed(2)}` : null
  ]
    .filter(Boolean)
    .join(' | ');

  console.log(head);
  console.log(parts.join(' | ') + (extras ? ` | ${extras}` : ''));
}
