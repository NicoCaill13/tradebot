import { yfQuote } from '../lib/yf.js';

const PAIR: Record<string,string> = {
  USD: 'USDUSD=X', EUR: 'EURUSD=X', GBP: 'GBPUSD=X', CHF: 'CHFUSD=X',
  SEK: 'SEKUSD=X', NOK: 'NOKUSD=X', DKK: 'DKKUSD=X'
};
const cache = new Map<string, number>();

export async function fxToUSD(ccy: string): Promise<number> {
  const k = ccy?.toUpperCase() || 'USD';
  if (k === 'USD') return 1;
  if (cache.has(k)) return cache.get(k)!;
  const q: any = await yfQuote(PAIR[k])
  const rate = Number(q?.regularMarketPrice ?? 1) || 1;
  cache.set(k, rate);
  return rate;
}
export async function priceToUSD(price: number, ccy: string): Promise<number> {
  const r = await fxToUSD(ccy); return price * r;
}
