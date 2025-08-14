// src/lib/fx.ts
import {yahoo} from '../utils.js';

const PAIR: Record<string,string> = {
  EUR: 'EURUSD=X', GBP: 'GBPUSD=X', CHF: 'CHFUSD=X',
  SEK: 'SEKUSD=X', NOK: 'NOKUSD=X', DKK: 'DKKUSD=X'
};
const cache = new Map<string, number>();

export async function fxToUSD(ccy: string): Promise<number> {
  if (!ccy || ccy === 'USD') return 1;
  if (!PAIR[ccy]) return 1;
  if (cache.has(ccy)) return cache.get(ccy)!;
  const q = await yahoo.quote(PAIR[ccy]) as any;
  const rate = Number(q?.regularMarketPrice ?? 1) || 1;
  cache.set(ccy, rate);
  return rate;
}

export async function toUSD(amount: number, ccy: string): Promise<number> {
  const rate = await fxToUSD(ccy);
  return amount * rate;
}
