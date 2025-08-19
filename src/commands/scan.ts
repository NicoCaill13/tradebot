// src/commands/scan.ts
// CLEAN SKELETON — collecte univers, snapshots daily, meta ; sortie rapport lisible.
// Aucune logique d'entrée/sortie ici : on branchera l'algo ensuite.

import { daily } from '../lib/history.js';
import { buildDiscover } from '../lib/discover.js';
import { writePlan } from '../lib/io.js';
import { yfQuoteSummary } from '../lib/yf.js';
import type { Bar } from '../types.js';

// -------- ENV (seulement ce qui est utile à ce stade) --------
const REGION = (process.env.REGION ?? 'ALL').toUpperCase();
const CAPITAL = Number(process.env.CAPITAL_DEFAULT ?? 100);

// -------- CONSTANTES (techniques / I/O) --------
const LOOKBACK_DAYS = 60;              // historique daily minimal
const YF_MAX_CONCURRENCY = 4;          // parallélisme API
const REPORT_MAX_ROWS = 200;           // limite d'affichage

// -------- UTILS --------
const ymd = (d: Date | string) => {
  const dt = new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const f2 = (n: number) => n.toFixed(2);
const f4 = (n: number) => n.toFixed(4);

async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R | null>
): Promise<R[]> {
  const out: (R | null)[] = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit || 1, arr.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;
      try { out[idx] = await fn(arr[idx], idx); } catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is R => v != null);
}

// -------- TYPES LOCAUX (propres au scan “clean”) --------
type Snapshot = {
  ticker: string;
  date: string;        // date de la dernière bougie daily (ISO)
  o: number; h: number; l: number; c: number; v: number;
  meta: {
    name?: string;
    currency?: string;
    marketCap?: number;      // en unités de la devise du titre (souvent USD)
    adv3m?: number;          // averageDailyVolume3Month
    quoteType?: string;
  };
};

// -------- PIPELINE CLEAN --------
export async function runScan(tickers?: string[]) {
  // 1) Univers
  let symbols = (tickers ?? []).map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) {
    symbols = await buildDiscover();
  }
  symbols = Array.from(new Set(symbols)); // dédup
  if (!symbols.length) {
    console.log(`SCAN (clean) — univers vide. Vérifie la découverte (REGION=${REGION}).`);
    return;
  }

  // 2) Snapshots (daily + meta) — aucun filtre trading ici
  const snaps = await mapLimit(symbols, YF_MAX_CONCURRENCY, async (t): Promise<Snapshot | null> => {
    try {
      const bars: Bar[] = await daily(t, LOOKBACK_DAYS);
      if (!bars?.length) return null;
      const last = bars[bars.length - 1];
      const o = Number(last.open), h = Number(last.high), l = Number(last.low), c = Number(last.close);
      const v = Number(last.volume ?? 0);
      if (![o,h,l,c].every(Number.isFinite)) return null;

      // meta légère via quoteSummary
      let name = '', currency = 'USD', marketCap = 0, adv3m = 0, quoteType = '';
      try {
        const qs: any = await yfQuoteSummary(t, ['price', 'summaryDetail', 'quoteType']);
        name = String(qs?.price?.longName ?? qs?.price?.shortName ?? '');
        currency = String(qs?.price?.currency ?? 'USD');
        marketCap = Number(qs?.price?.marketCap ?? qs?.summaryDetail?.marketCap ?? 0);
        adv3m = Number(qs?.summaryDetail?.averageDailyVolume3Month ?? 0);
        quoteType = String(qs?.quoteType?.quoteType ?? '');
      } catch { /* soft*/ }

      return {
        ticker: t,
        date: (last.date instanceof Date ? last.date.toISOString() : String(last.date)),
        o, h, l, c, v,
        meta: { name, currency, marketCap, adv3m, quoteType }
      };
    } catch {
      return null;
    }
  });

  if (!snaps.length) {
    console.log(`SCAN (clean) — aucun snapshot récupéré sur ${symbols.length} tickers.`);
    return;
  }

  // 3) Rapport (aucun tri “alpha” imposé : on trie alphabétique pour lecture)
  const byTicker = [...snaps].sort((a, b) => a.ticker.localeCompare(b.ticker)).slice(0, REPORT_MAX_ROWS);
  const sessionYMD = ymd(byTicker[0].date);
  const header =
    `SCAN ${sessionYMD} — Clean snapshot (univers=${symbols.length}, échantillon=${byTicker.length})\n` +
    `Capital: ${CAPITAL}\n` +
    `NOTE: aucune logique d'entrée/stop/TP ici. On branchera l'algorithme de décision sur ces snapshots.`;

  const legend = 'COLONNES : TICKER | DATE | O/H/L/C | VOL | CAP(M$) | ADV3m | CUR | TYPE | NOM';
  const lines: string[] = [header, legend];

  for (const s of byTicker) {
    const capM = s.meta.marketCap ? (s.meta.marketCap / 1e6) : 0;
    lines.push(
      [
        s.ticker.padEnd(6),
        s.date.slice(0,10),
        `O ${f4(s.o)}`,
        `H ${f4(s.h)}`,
        `L ${f4(s.l)}`,
        `C ${f4(s.c)}`,
        `V ${s.v.toLocaleString()}`,
        `CAP ${capM ? f2(capM) + 'M' : '-'}`,
        `ADV3m ${s.meta.adv3m ? s.meta.adv3m.toLocaleString() : '-'}`,
        s.meta.currency ?? 'USD',
        s.meta.quoteType ?? '',
        (s.meta.name ?? '').slice(0, 40)
      ].join(' | ')
    );
  }

  const txt = lines.join('\n');
  const path = await writePlan(`scan-${sessionYMD}-clean.txt`, txt);

  console.log(txt);
  console.log(`\nRapport enregistré → ${path}\n`);
}
