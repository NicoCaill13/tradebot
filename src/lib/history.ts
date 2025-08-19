// src/lib/history.ts
import type { Bar } from '../types.js';
import { yfChart } from './yf.js';

function mapChartToBars(ch: any): Bar[] {
  if (!ch) return [];
  if (Array.isArray(ch?.quotes)) {
    return ch.quotes.map((q: any) => ({
      date:   new Date(q.date),
      open:   Number(q.open ?? 0),
      high:   Number(q.high ?? 0),
      low:    Number(q.low ?? 0),
      close:  Number(q.close ?? 0),
      volume: Number(q.volume ?? 0),
    }));
  }
  const ts: number[] | undefined = ch?.timestamp;
  const q0 = ch?.indicators?.quote?.[0];
  if (!ts || !q0) return [];
  const n = Math.min(
    ts.length,
    q0.open?.length ?? 0,
    q0.high?.length ?? 0,
    q0.low?.length ?? 0,
    q0.close?.length ?? 0,
    q0.volume?.length ?? 0
  );
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      date:   new Date(ts[i] * 1000),
      open:   Number(q0.open?.[i] ?? 0),
      high:   Number(q0.high?.[i] ?? 0),
      low:    Number(q0.low?.[i]  ?? 0),
      close:  Number(q0.close?.[i]?? 0),
      volume: Number(q0.volume?.[i]?? 0),
    });
  }
  return out;
}

/** Bougies daily : utilise toujours period1/period2 (jamais range) */
export async function daily(symbol: string, lookbackDays = 60): Promise<Bar[]> {
  const now = Date.now();
  const p1  = new Date(now - lookbackDays * 864e5);
  const p2  = new Date(now);
  const ch  = await yfChart(symbol, { interval: '1d', period1: p1, period2: p2 }).catch(() => null);
  return mapChartToBars(ch);
}

/** Bougies 60 minutes : utilise toujours period1/period2 (jamais range) */
export async function intraday60m(symbol: string, lookbackDays = 20): Promise<Bar[]> {
  // garde 30 jours par défaut pour être large sur l’intraday
  const days = Math.max(lookbackDays, 30);
  const now  = Date.now();
  const p1   = new Date(now - days * 864e5);
  const p2   = new Date(now);
  const ch   = await yfChart(symbol, { interval: '60m', period1: p1, period2: p2 }).catch(() => null);
  return mapChartToBars(ch);
}

/** Agrégation 60m -> 4H (4 barres de 60m successives) */
export function to4h(bars60m: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars60m.length; i += 4) {
    const g = bars60m.slice(i, i + 4);
    if (!g.length) continue;
    const open = Number(g[0].open);
    const close = Number(g[g.length - 1].close);
    const high = Math.max(...g.map(b => Number(b.high)));
    const low  = Math.min(...g.map(b => Number(b.low)));
    const volume = g.reduce((s, b) => s + Number(b.volume ?? 0), 0);
    const date = g[g.length - 1].date;
    out.push({ date, open, high, low, close, volume });
  }
  return out;
}
