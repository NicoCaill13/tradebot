import { yahoo } from '../types.js';
import { DailyBar } from '../types.js';

export async function intraday(symbol: string, days=2, interval:'1m'|'5m'='1m'): Promise<DailyBar[]> {
  const period2 = new Date();
  const period1 = new Date(Date.now() - days*24*60*60*1000);
  const ch: any = await yahoo.chart(symbol, { period1, period2, interval }).catch(()=>null);
  const rows = Array.isArray(ch?.quotes) ? ch.quotes : [];
  return rows.map((q:any)=>({
    date: new Date(q.date),
    open: Number(q.open ?? 0), high: Number(q.high ?? 0), low: Number(q.low ?? 0),
    close: Number(q.close ?? 0), volume: Number(q.volume ?? 0),
  }));
}
