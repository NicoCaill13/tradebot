// src/commands/status.ts
import { loadState } from '../state.js';
import { CONFIG } from '../config.js';
import { fetchMarket } from '../market.js';
import { TODAY } from '../env.js';
import { withinPreEventWindow } from '../utils.js';
import { promises as fs } from 'fs';
import path from 'path';

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const fmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);

export async function runStatus() {
  const state = await loadState();

  // Fetch latest quotes in parallel
  const tickers = CONFIG.positions.map((p) => p.ticker);
  const markets = await Promise.all(tickers.map((t) => fetchMarket(t)));
  const byTicker = Object.fromEntries(markets.map((m) => [m.ticker, m] as const));

  type Row = {
    Ticker: string;
    Last: string;
    PRU: string;
    'Trail %': string;
    STOP: string;
    TP1: string;
    TP2: string;
    TP3: string;
    'Event window': string;
  };

  const rows: Row[] = [];

  for (const p of CONFIG.positions) {
    const t = p.ticker;
    const st = state.positions[t];
    const mkt = byTicker[t];

    const last = mkt?.price ?? null;
    const pru = st?.avgCost ?? 0;
    const stopPx = st?.trailingStopPrice ?? null;
    const trailPct = st?.trailingStopPct ?? p.stops.trailingPct;

    // Take-profits (jusqu’à 3 niveaux affichés)
    const levels = p.takeProfitLevels ?? [];
    const tpCols = [0, 1, 2].map((i) => {
      const tp = levels[i];
      if (tp == null || !pru) return '—';
      const target = pru * (1 + tp);
      const hit = last != null && last >= target;
      return `${pct(tp)} @ ${target.toFixed(4)} ${hit ? '✅ HIT' : '… en attente'}`;
    });

    // Fenêtre pré-événement (si datée)
    let eventCol = '—';
    if (p.preEventTrim?.eventDate) {
      const inWin = withinPreEventWindow(
        p.preEventTrim.eventDate,
        p.preEventTrim.windowDaysMin,
        p.preEventTrim.windowDaysMax
      );
      const daysTo = Math.ceil(
        (new Date(p.preEventTrim.eventDate).getTime() - Date.now()) / 86400000
      );
      eventCol = `${p.preEventTrim.eventDate}${
        Number.isFinite(daysTo) ? ` (${Math.max(0, daysTo)} j)` : ''
      }${inWin ? ` ⚠︎ fenêtre J-${p.preEventTrim.windowDaysMax}..J-${p.preEventTrim.windowDaysMin}` : ''}`;
    }

    rows.push({
      Ticker: t,
      Last: fmt(last),
      PRU: fmt(pru || null),
      'Trail %': pct(trailPct),
      STOP: fmt(stopPx),
      TP1: tpCols[0],
      TP2: tpCols[1],
      TP3: tpCols[2],
      'Event window': eventCol,
    });
  }

  // Console
  console.log(`\n=== STATUS — ${TODAY} ===`);
  console.table(rows);

  // Export JSON
  const outDir = path.join(process.cwd(), 'out');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `status-${TODAY}.json`);
  await fs.writeFile(outPath, JSON.stringify({ date: TODAY, rows }, null, 2));
  console.log(`\nFichier exporté → ${outPath}\n`);
}
