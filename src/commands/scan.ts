// src/commands/scan.ts — Daily filtered swing plan (micro-caps equity only)

import { daily} from '../lib/history.js';
import { buildDiscover } from '../lib/discover.js';
import { writePlan } from '../lib/io.js';
import { sma } from '../lib/indicators.js';
import { yfQuoteSummary } from '../lib/yf.js';

import { Bar } from '../types.js';
import { reviewWithAI } from '../lib/aiReview.js';
import { ReviewCandidate, PlanRow, TrendUsed } from '../types.js';

import {
  // Core capital/risk/runtime
  CAPITAL_DEFAULT,
  CAPITAL_SYNC_WITH_ENV,
  RISK_PER_TRADE_PCT,
  YF_MAX_CONCURRENCY,

  // Strategy (entry/stop/tp/sizing)
  ENTRY_BUFFER_PCT, STOP_BUFFER_PCT, TP1_MULT, TP2_MULT,
  MIN_SHARES, MIN_NOTIONAL_USD,

  // Filters (price / range / trend / volume / adv)
  MIN_PRICE_USD, MAX_PRICE_USD,
  FILTER_MIN_RANGE_PCT, FILTER_MAX_RANGE_PCT,
  TREND_FILTER, MIN_VOL_LAST, PLAN_MAX_ROWS,
  MIN_ADV_3M,

  // Swing governance (display only here)
  TIME_STOP_FRIDAY, INVALIDATE_ON_DAILY_SMA20_BREAK, GAP_REANCHOR_PCT,

  // Micro-cap & security-type constraints
  MIN_CAP_USD, MAX_CAP_USD,
  ALLOW_SECURITY_TYPES, EXCLUDE_NAME_PATTERNS,
} from '../settings.js';

// ---------- Utils ----------
const ymd = (d: Date | string) => {
  const dt = new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const f4 = (n: number) => n.toFixed(4);

async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R | null>
): Promise<R[]> {
  const out: (R | null)[] = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit || 4, arr.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;
      try { out[idx] = await fn(arr[idx], idx); } catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is R => v != null);
}

function rangePct(high: number, low: number) {
  const mid = (high + low) / 2;
  return mid > 0 ? (high - low) / mid : 0;
}

function renderParamsBlock(capital: number) {
  const lines = [
    'PARAMS (résolus) :',
    `• Strategy : Daily breakout du plus haut d’hier, stop sous le plus bas d’hier, TP = ${TP1_MULT}R / ${TP2_MULT}R`,
    `• Execution : ENTRY_BUFFER=${(ENTRY_BUFFER_PCT*100).toFixed(2)}% | STOP_BUFFER=${(STOP_BUFFER_PCT*100).toFixed(2)}%`,
    `• Sizing : capital=${capital} | risk/trade=${(RISK_PER_TRADE_PCT*100).toFixed(2)}% | minNotionalUSD=${MIN_NOTIONAL_USD} | minShares=${MIN_SHARES}`,
    `• Filtres prix (USD) : min=${MIN_PRICE_USD || '—'} | max=${MAX_PRICE_USD || '—'}`,
    `• Filtres range : min=${(FILTER_MIN_RANGE_PCT*100).toFixed(2)}% | max=${(FILTER_MAX_RANGE_PCT*100).toFixed(2)}%`,
    `• Trend daily : ${TREND_FILTER}  (OFF | WEAK[close≥SMA20 OU SMA20↑] | BASIC[close>SMA20 ET SMA20↑])`,
    `• Liquidité : volLast≥${MIN_VOL_LAST || 0} | ADV3m≥${MIN_ADV_3M || 0}`,
    `• Micro-cap & type : marketCap in [${MIN_CAP_USD||0}..${MAX_CAP_USD||'∞'}] | allow=[${ALLOW_SECURITY_TYPES.join(',')}] | excludeName=/${EXCLUDE_NAME_PATTERNS.join('|')}/i`,
    `• Limite sorties : PLAN_MAX_ROWS=${PLAN_MAX_ROWS}`,
    `• Règles swing : timeStopVendredi=${TIME_STOP_FRIDAY} | invalidationClose<SMA20(daily)=${INVALIDATE_ON_DAILY_SMA20_BREAK} | gapReanchor=${(GAP_REANCHOR_PCT*100).toFixed(2)}%`,
  ];
  return lines.join('\n');
}

// ---------- SCAN principal ----------
export async function runScan(tickers?: string[]) {
  // 0) Univers : CLI > discover()
  let symbols = (tickers ?? []).map(t => t.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) {
    symbols = await buildDiscover();
    if (!symbols.length) {
      console.log('scan: univers vide (vérifie REGION et la découverte).');
      return;
    }
  }

  const capital = CAPITAL_SYNC_WITH_ENV ? CAPITAL_DEFAULT : CAPITAL_DEFAULT;

  // Compteurs debug
  let nAll = 0, nPrice = 0, nRange = 0, nTrend = 0, nVol = 0, nAdv = 0;
  let nType = 0, nName = 0, nCap = 0;

  const plans = await mapLimit(symbols, YF_MAX_CONCURRENCY || 4, async (t): Promise<PlanRow | null> => {
    nAll++;
    try {
      // 1) Daily bars (dernier jour complet)
      const dBars: Bar[] = await daily(t, 60);
      if (!dBars.length) return null;

      const last = dBars[dBars.length - 1];
      const high = Number(last.high);
      const low  = Number(last.low);
      const close = Number(last.close);
      const volLast = Number(last.volume ?? 0);

      if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
      if (high <= 0 || low < 0 || high <= low) return null;

      // 2) Métadonnées (type, nom, cap, adv) via quoteSummary
      let qt = 'UNKNOWN', longName = '', marketCap = 0, adv3m = 0;
      try {
        const qs: any = await yfQuoteSummary(t, ['price', 'quoteType', 'summaryDetail']);
        qt = String(qs?.quoteType?.quoteType ?? '').toUpperCase();
        longName = String(qs?.price?.longName ?? qs?.price?.shortName ?? '');
        marketCap = Number(qs?.price?.marketCap ?? qs?.summaryDetail?.marketCap ?? 0);
        adv3m = Number(qs?.summaryDetail?.averageDailyVolume3Month ?? 0);
      } catch { /* on tolère l’échec API */ }

      // 2.a) Type autorisé
      if (ALLOW_SECURITY_TYPES.length && !ALLOW_SECURITY_TYPES.includes(qt)) { nType++; return null; }

      // 2.b) Exclusions par nom (fonds/ETF/trust/closed-end/etc.)
      if (EXCLUDE_NAME_PATTERNS.length && longName) {
        const rx = new RegExp(EXCLUDE_NAME_PATTERNS.join('|'), 'i');
        if (rx.test(longName)) { nName++; return null; }
      }

      // 2.c) Filtre market cap (si Yahoo renvoie une valeur)
      if (MIN_CAP_USD > 0 && marketCap && marketCap < MIN_CAP_USD) { nCap++; return null; }
      if (MAX_CAP_USD > 0 && marketCap && marketCap > MAX_CAP_USD) { nCap++; return null; }

      // 3) PRICE filter (USD) — si 0 => pas de filtre
      if (MIN_PRICE_USD > 0 && close < MIN_PRICE_USD) { nPrice++; return null; }
      if (MAX_PRICE_USD > 0 && close > MAX_PRICE_USD) { nPrice++; return null; }

      // 4) RANGE% filter
      const rPct = rangePct(high, low);
      if (rPct < FILTER_MIN_RANGE_PCT || rPct > FILTER_MAX_RANGE_PCT) { nRange++; return null; }

      // 5) TREND daily simple
      let trendOK = true as boolean;
      let trendUsed: TrendUsed = TREND_FILTER as TrendUsed;
      if (TREND_FILTER !== 'OFF') {
        const closes = dBars.map(b => Number(b.close));
        const s20 = sma(closes, 20);
        const i = closes.length - 1;
        const S20 = s20[i];
        const S20p = s20[i - 1];
        if (TREND_FILTER === 'WEAK') {
          // close >= SMA20  OU  SMA20 en hausse
          trendOK = (close >= S20) || (S20 >= S20p);
        } else { // BASIC
          // close > SMA20  ET  SMA20 en hausse
          trendOK = (close > S20) && (S20 >= S20p);
        }
      } else {
        trendUsed = 'OFF';
      }
      if (!trendOK) { nTrend++; return null; }

      // 6) Liquidity (optionnel)
      if (MIN_VOL_LAST > 0 && volLast < MIN_VOL_LAST) { nVol++; return null; }
      if (MIN_ADV_3M > 0 && adv3m > 0 && adv3m < MIN_ADV_3M) { nAdv++; return null; }

      // 7) Entrée / Stop / TP
      const entry = high * (1 + ENTRY_BUFFER_PCT);
      let stop = Math.max(0.0001, low * (1 - STOP_BUFFER_PCT));
      if (stop >= entry) {
        stop = Math.max(0.0001, low * (1 - 3 * STOP_BUFFER_PCT));
        if (stop >= entry) return null;
      }
      const R = entry - stop;
      const tp1 = entry + TP1_MULT * R;
      const tp2 = entry + TP2_MULT * R;

      // 8) Sizing par risque avec minimas
      const risk$ = capital * RISK_PER_TRADE_PCT;
      let shares = Math.floor(risk$ / R);
      if (MIN_NOTIONAL_USD > 0) {
        const minByNotional = Math.ceil(MIN_NOTIONAL_USD / entry);
        shares = Math.max(shares, minByNotional);
      }
      shares = Math.max(shares, MIN_SHARES);
      if (shares <= 0 || !Number.isFinite(shares)) return null;

      return {
        ticker: t,
        signalDate: last.date.toISOString(),
        entry, stop, tp1, tp2, shares,
        meta: { close, rangePct: rPct, volLast, trendUsed, marketCap }
      };
    } catch {
      return null;
    }
  });

  if (!plans.length) {
    console.log('Aucun plan retenu après filtres.');
    console.log(`[debug] total=${nAll} | type=${nType} | name=${nName} | cap=${nCap} | price=${nPrice} | range=${nRange} | trend=${nTrend} | vol=${nVol} | adv=${nAdv}`);
    console.log('Astuce: desserre FILTER_MIN_RANGE_PCT / FILTER_MAX_RANGE_PCT, mets TREND_FILTER=OFF, baisse MIN_VOL_LAST / MIN_ADV_3M, ou élargis MAX_CAP_USD.');
    return;
  }

  // Tri par "jus" (range%) et limite le nombre de lignes
  plans.sort((a, b) => b.meta.rangePct - a.meta.rangePct);
  const rows = plans.slice(0, PLAN_MAX_ROWS > 0 ? PLAN_MAX_ROWS : plans.length);

  // Rendu + sauvegarde
  const sessYMD = ymd(rows[0].signalDate);
  const aiEnabled = (process.env.REVIEW_WITH_AI ?? 'false').toLowerCase() === 'true';
  const header = `PLAN ${sessYMD} — Daily (filtres progressifs, micro-caps equity only${aiEnabled ? ', AI-review' : ''})`;
  const params = renderParamsBlock(capital);
  const legend =
    'LÉGENDE : ENTRY_TRIGGER = cassure du plus haut d’hier (ordre stop) | STOP_LOSS = sous le plus bas d’hier | TP1/TP2 = 1.5R/3R | QTY = quantité (risk-based)';
  const lines: string[] = [header, params, legend];

  for (const r of rows) {
    lines.push(
      [
        `BUY STOP ${r.ticker.padEnd(6)}`,
        `QTY ${String(r.shares).padStart(5)}`,
        `ENTRY_TRIGGER ${f4(r.entry)}`,
        `STOP_LOSS ${f4(r.stop)}`,
        `TP1 ${f4(r.tp1)}`,
        `TP2 ${f4(r.tp2)}`,
        `// close ${f4(r.meta.close)} | range ${(r.meta.rangePct*100).toFixed(2)}% | trend ${r.meta.trendUsed}` +
        (r.meta.marketCap ? ` | cap $${(r.meta.marketCap/1e6).toFixed(0)}M` : '') +
        (MIN_ADV_3M > 0 ? ` | note: ADV3m filter applied` : '')
      ].join(' | ')
    );
  }

  const txt = lines.join('\n');
  const path = await writePlan(`plan-${sessYMD}-daily-microcaps.txt`, txt);
  console.log(txt);
  console.log(`\nPlan enregistré → ${path}\n`);
}