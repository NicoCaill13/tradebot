// src/commands/targets.ts
// Prints clear take-profit targets (prices and share quantities) per ticker.
import { loadState } from '../state.js';
import { CONFIG } from '../config.js';
import { TODAY } from '../env.js';

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const fmtPx = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);

export async function runTargets() {
  const state = await loadState();

  type Row = {
    Ticker: string;
    Shares: number | string;
    PRU: string;
    TP1: string;
    TP2: string;
    TP3: string;
  };

  const rows: Row[] = [];

  for (const p of CONFIG.positions) {
    const st = state.positions[p.ticker];
    const levels = p.takeProfitLevels ?? [];

    if (!st || st.shares <= 0 || !st.avgCost || levels.length === 0) {
      rows.push({
        Ticker: p.ticker,
        Shares: st?.shares ?? 0,
        PRU: fmtPx(st?.avgCost ?? null),
        TP1: '—', TP2: '—', TP3: '—',
      });
      continue;
    }

    let remaining = st.shares;
    const tpCols: string[] = [];

    for (let i = 0; i < 3; i++) {
      const tp = levels[i];
      if (tp == null) { tpCols.push('—'); continue; }
      const price = st.avgCost * (1 + tp);
      const qty = Math.max(1, Math.floor(remaining / 3));
      tpCols.push(`${fmtPx(price)} | ${pct(tp)} | ${qty} sh`);
      remaining = Math.max(0, remaining - qty);
    }

    rows.push({
      Ticker: p.ticker,
      Shares: st.shares,
      PRU: fmtPx(st.avgCost),
      TP1: tpCols[0] ?? '—',
      TP2: tpCols[1] ?? '—',
      TP3: tpCols[2] ?? '—',
    });
  }

  console.log(`\n=== TARGETS (Take-Profits à placer GTC) — ${TODAY} ===`);
  console.table(rows);
  console.log('\nConseil: place des ordres limite GTC aux prix ci-dessus, avec les quantités indiquées.');
}
