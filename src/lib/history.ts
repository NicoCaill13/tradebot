import { yfChart } from './yf.js';
import { Bar } from '../types.js';

function mapChartToBars(ch: any): Bar[] {
  if (Array.isArray(ch?.quotes)) {
    return ch.quotes.map((q: any) => ({
      date: new Date(q.date),
      open: Number(q.open ?? 0),
      high: Number(q.high ?? 0),
      low: Number(q.low ?? 0),
      close: Number(q.close ?? 0),
      volume: Number(q.volume ?? 0),
    }));
  }
  const ts: number[] | undefined = ch?.timestamp;
  const q0 = ch?.indicators?.quote?.[0];
  if (Array.isArray(ts) && q0) {
    const O = q0.open ?? [], H = q0.high ?? [], L = q0.low ?? [], C = q0.close ?? [], V = q0.volume ?? [];
    const n = ts.length; const out: Bar[] = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = { date: new Date(ts[i] * 1000), open: Number(O[i] ?? 0), high: Number(H[i] ?? 0), low: Number(L[i] ?? 0), close: Number(C[i] ?? 0), volume: Number(V[i] ?? 0) };
    }
    return out;
  }
  return [];
}

export async function daily(symbol: string, lookbackDays = 260): Promise<Bar[]> {
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - lookbackDays * 86400000);
  const ch: any = await yfChart(symbol, { period1, period2, interval: '1d' }).catch(()=>null);
  return mapChartToBars(ch).filter(b => Number.isFinite(b.open) && Number.isFinite(b.close)).sort((a,b)=>+a.date-+b.date);
}

export async function hourly60(symbol: string, lookbackDays = 15): Promise<Bar[]> {
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - lookbackDays * 86400000);
  const ch: any = await yfChart(symbol, { period1, period2, interval: '60m' }).catch(()=>null);
  return mapChartToBars(ch).filter(b => Number.isFinite(b.open) && Number.isFinite(b.close)).sort((a,b)=>+a.date-+b.date);
}

export function to4h(bars60: Bar[]): Bar[] {
  // Regroupe par jour civil, puis agrège 4 barres de 60m -> 240m
  const days = new Map<string, Bar[]>();
  for (const b of bars60) {
    const ds = new Date(b.date).toDateString();
    const arr = days.get(ds) ?? [];
    arr.push(b);
    days.set(ds, arr);
  }
  const out: Bar[] = [];
  for (const [, arr] of Array.from(days.entries()).sort((a,b)=>+new Date(a[0]) - +new Date(b[0]))) {
    const sorted = arr.sort((a,b)=>+a.date-+b.date);
    for (let i = 0; i + 3 < sorted.length; i += 4) {
      const chunk = sorted.slice(i, i+4);
      const open = chunk[0].open;
      const close = chunk[3].close;
      const high = Math.max(...chunk.map(x=>x.high));
      const low  = Math.min(...chunk.map(x=>x.low));
      const volume = chunk.reduce((s,x)=>s + (x.volume||0), 0);
      const date = chunk[3].date; // fin du bloc 4h
      out.push({ date, open, high, low, close, volume });
    }
  }
  return out;
}