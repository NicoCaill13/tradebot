// src/commands/scan.ts — Overnight planner (marchés fermés)
// Génére des ordres BUY STOP-LIMIT pour la prochaine séance sur breakout du plus haut d’hier.
// Stop = entry - k*ATR14 ; TP = 1.5R et 3R ; sizing au risque ; budgets et caps respectés.

import { yfQuote, yfQuoteSummary } from '../lib/yf.js';
import { daily } from '../lib/history.js';
import { ema, atr } from '../lib/indicators.js';
import { matchRegion } from '../lib/regions.js';
import { Region } from '../types.js';
import {
  TODAY,
  MIN_ADV_3M,
  TP_R_MULT_1,
  TP_R_MULT_2,
  STOP_ATR_MULT,
  CAPITAL_DEFAULT,
  CAPITAL_SYNC_WITH_ENV,
  RISK_PER_TRADE_PCT,
  YF_MAX_CONCURRENCY,
  OVERNIGHT_BREAK_BUFFER_PCT,
  ENTRY_STOPLIMIT_BUFFER_PCT,
  PLAN_MAX_PER_SIDE,
  MIN_NOTIONAL_USD,
  MIN_SHARES,
  ORDER_MAX_NOTIONAL_PCT,
  DAILY_NOTIONAL_BUDGET_PCT,
  DAILY_RISK_BUDGET_PCT,
  MAX_TRADES_PER_DAY,
  MAX_TRADES_PER_SIDE,
  INCLUDE_FUNDS,
} from '../settings.js';
import { writePlan } from '../lib/io.js';
import {buildDiscover} from '../lib/discover.js'

type Side = 'EU' | 'US';

type PlanRow = {
  ticker: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  shares: number;
  side: Side;
  why: string;
  orderRisk: number;    // $ risqué sur l'ordre (shares * (entry - stop))
  orderNotional: number; // $ notionnel de l'ordre (shares * entry)
};

// exécuteur parallèle borné
async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R | null>,
): Promise<R[]> {
  const out: (R | null)[] = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;
      try {
        out[idx] = await fn(arr[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is R => v != null);
}

export async function runScan(tickers?: string[]) {
  let symbols = (tickers || []).map(t => t.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) {
    symbols = await buildDiscover();
    if (!symbols.length) {
      console.log('scan: aucun ticker éligible (univers vide). Ajuste les filtres .env.');
      return;
    }
  }

  // Capital de référence pour sizing (si tu gères un state de PnL/cash, branche-le ici)
  const capital = CAPITAL_SYNC_WITH_ENV ? CAPITAL_DEFAULT : CAPITAL_DEFAULT;

  const candidates = await mapLimit(
    symbols,
    YF_MAX_CONCURRENCY || 4,
    async (t): Promise<PlanRow | null> => {
      try {
        // Données de base
        const [q, s]: any = await Promise.all([
          yfQuote(t),
          // On inclut 'quoteType' pour filtrer ETF/FUND/CEF proprement
          yfQuoteSummary(t, ['price', 'summaryDetail', 'quoteType']),
        ]);

        const exchName = (q?.fullExchangeName || q?.exchange || '').toString();
        const exchCode = (q?.exchange || '').toString();

        // Side (US / EU) selon la place
        const side: Side =
          matchRegion(Region.US, t, exchName, exchCode) ? 'US'
            : matchRegion(Region.EU, t, exchName, exchCode) ? 'EU'
            : (null as any);
        if (!side) return null;

        // Filtre "fonds" si demandé
        const quoteType = String(q?.quoteType ?? s?.quoteType?.quoteType ?? '');
        if (!INCLUDE_FUNDS && /ETF|FUND|MUTUAL|CEF|ETN/i.test(quoteType)) return null;

        // Liquidité minimale (ADV 3m)
        const adv = Number(
          s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? 0,
        );
        if (!adv || adv < MIN_ADV_3M) return null;

        // Barres daily (veille incluse)
        const bars = await daily(t, 90);
        if (bars.length < 20) return null;

        const highs = bars.map((b) => b.high);
        const lows = bars.map((b) => b.low);
        const closes = bars.map((b) => b.close);

        // ATR14
        const a14 = atr(highs, lows, closes, 14);
        const lastATR = a14[a14.length - 1] ?? 0;
        if (!lastATR) return null;

        // Momentum simple : EMA20 montante et close > EMA20
        const e20 = ema(closes, 20);
        const lastE20 = e20[e20.length - 1];
        const prevE20 = e20[e20.length - 2] ?? lastE20;
        const lastClose = closes[closes.length - 1];
        if (!(lastClose > lastE20 && lastE20 >= prevE20)) return null;

        // Plus haut / plus bas d'hier (dernière barre)
        const nb = bars.length;
        const yHigh = bars[nb - 1].high;
        const yLow = bars[nb - 1].low;

        // Entrée = breakout du plus haut d'hier + buffer
        const entry = yHigh * (1 + OVERNIGHT_BREAK_BUFFER_PCT);

        // Stop = entry - k * ATR
        const stop = Math.max(0.01, entry - STOP_ATR_MULT * lastATR);
        const R = entry - stop;
        if (R <= 0) return null;

        // Targets
        const tp1 = entry + TP_R_MULT_1 * R;
        const tp2 = entry + TP_R_MULT_2 * R;

        // --- Sizing au risque ---
        const risk$ = capital * RISK_PER_TRADE_PCT;
        let shares = Math.max(0, Math.floor(risk$ / R));
        if (shares <= 0) return null;

        // Minima (si définis)
        if (MIN_SHARES > 0) shares = Math.max(shares, MIN_SHARES);
        if (MIN_NOTIONAL_USD > 0) shares = Math.max(shares, Math.ceil(MIN_NOTIONAL_USD / entry));

        // Cap par ordre : notionnel max = % du capital
        const maxOrderNotional = capital * ORDER_MAX_NOTIONAL_PCT;
        if (maxOrderNotional > 0) {
          const capShares = Math.floor(maxOrderNotional / entry);
          shares = Math.min(shares, capShares);
        }

        // Si le cap rend l'ordre trop petit, on skip (mieux que violer la contrainte)
        if (shares <= 0 || shares * entry < MIN_NOTIONAL_USD || shares < MIN_SHARES) return null;

        const orderRisk = shares * R;
        const orderNotional = shares * entry;

        const why = `Overnight: breakout > YHigh (${yHigh.toFixed(4)}), EMA20 up, ATR14=${lastATR.toFixed(
          4,
        )}`;
        return { ticker: t, entry, stop, tp1, tp2, shares, side, why, orderRisk, orderNotional };
      } catch {
        return null;
      }
    },
  );

  if (!candidates.length) {
    console.log(`Aucun setup détecté aujourd'hui (${TODAY}).`);
    return;
  }

  // Sélection finale sous contraintes journalières
  // (budgets cumulés, limites par côté et total)
  let cumRisk = 0;
  let cumNotional = 0;
  let countTotal = 0;
  let countEU = 0;
  let countUS = 0;

  const maxDailyRisk = capital * DAILY_RISK_BUDGET_PCT;
  const maxDailyNotional = capital * DAILY_NOTIONAL_BUDGET_PCT;

  const pickedEU: PlanRow[] = [];
  const pickedUS: PlanRow[] = [];

  // (Option : tu peux trier par priorité ici. Ex: notionnel croissant pour plus de diversité)
  // candidates.sort((a, b) => a.orderNotional - b.orderNotional);

  for (const r of candidates) {
    if (countTotal >= MAX_TRADES_PER_DAY) break;

    const sideCount = r.side === 'EU' ? countEU : countUS;
    const maxSide = Math.min(MAX_TRADES_PER_SIDE, PLAN_MAX_PER_SIDE);
    if (sideCount >= maxSide) continue;

    const nextRisk = cumRisk + r.orderRisk;
    const nextNot = cumNotional + r.orderNotional;

    if (maxDailyRisk > 0 && nextRisk > maxDailyRisk) continue;
    if (maxDailyNotional > 0 && nextNot > maxDailyNotional) continue;

    // ok, on prend
    if (r.side === 'EU') {
      pickedEU.push(r);
      countEU++;
    } else {
      pickedUS.push(r);
      countUS++;
    }
    countTotal++;
    cumRisk = nextRisk;
    cumNotional = nextNot;
  }

  // Cap de sécurité par côté (au cas où)
  const eu = pickedEU.slice(0, PLAN_MAX_PER_SIDE);
  const us = pickedUS.slice(0, PLAN_MAX_PER_SIDE);

  if (!eu.length && !us.length) {
    console.log(`Aucun setup détecté aujourd'hui (${TODAY}).`);
    return;
  }

  // Format des ordres : BUY STOP-LIMIT (validité: day)
  function render(rows: PlanRow[], label: string) {
    if (!rows.length) return '';
  
    const lines: string[] = [];
    lines.push(`DAY PLAN — ${TODAY} [${label}]`);
    lines.push(
      'LÉGENDE : ENTRY_TRIGGER = prix qui déclenche l’achat (ordre stop) | ' +
      'ENTRY_LIMIT = borne max du stop-limit | STOP_LOSS = stop de protection | ' +
      'TP1/TP2 = prises de profit | QTY = quantité'
    );
  
    for (const r of rows) {
      const entryTrigger = r.entry;
      const entryLimit   = r.entry * (1 + ENTRY_STOPLIMIT_BUFFER_PCT);
  
      lines.push(
        [
          `BUY STOP-LIMIT ${r.ticker.padEnd(6)}`,
          `QTY ${String(r.shares).padStart(5)}`,
          `ENTRY_TRIGGER ${entryTrigger.toFixed(4)}`,
          `ENTRY_LIMIT ${entryLimit.toFixed(4)}`,
          `STOP_LOSS ${r.stop.toFixed(4)}`,
          `TP1 ${r.tp1.toFixed(4)}`,
          `TP2 ${r.tp2.toFixed(4)}`,
          `// ${r.why}`
        ].join(' | ')
      );
    }
  
    return lines.join('\n');
  }
  const euText = render(eu, 'EU (prochaine séance)');
const usText = render(us, 'US (prochaine séance)');

if (euText) {
  const pTxt = await writePlan(`plan-eu-${TODAY}.txt`, euText);
  console.log(euText);
  console.log(`\nPlan EU enregistré → ${pTxt}\n`);
}
if (usText) {
  const pTxt = await writePlan(`plan-us-${TODAY}.txt`, usText);
  console.log(usText);
  console.log(`\nPlan US enregistré → ${pTxt}\n`);
}
}
