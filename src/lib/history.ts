// src/lib/history.ts (ajout)
import { yfChart } from './yf.js';
import type { DailyBar } from '../types.js';

export async function daily(symbol: string, lookbackDays = 60): Promise<DailyBar[]> {
  const period2 = new Date();
  const period1 = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const ch: any = await yfChart(symbol, { period1, period2, interval: '1d' }).catch(() => null);
  const rows = Array.isArray(ch?.quotes) ? ch.quotes : [];
  return rows.map((q: any) => ({
    date: new Date(q.date),
    open: Number(q.open ?? 0),
    high: Number(q.high ?? 0),
    low: Number(q.low ?? 0),
    close: Number(q.close ?? 0),
    volume: Number(q.volume ?? 0),
  }));
}
