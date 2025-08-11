import YahooFinance from 'yahoo-finance2';
import type { MarketInfo } from './types.js'; // NOTE: sans .js avec moduleResolution=node

// crée une instance (corrige le 'this' typing)
const yahoo = new (YahooFinance as any)();

export async function fetchMarket(ticker: string): Promise<MarketInfo> {
  const [q, s] = await Promise.all([
    yahoo.quote(ticker),
    yahoo.quoteSummary(ticker, { modules: ['price', 'summaryDetail'] })
  ]);

  const price = (q?.regularMarketPrice ?? null) as number | null;
  const changePct = (q?.regularMarketChangePercent ?? null) as number | null;
  const dayHigh = (q?.regularMarketDayHigh ?? null) as number | null;
  const dayLow = (q?.regularMarketDayLow ?? null) as number | null;
  const prevClose = (q?.regularMarketPreviousClose ?? null) as number | null;

  const marketCap = (s?.price?.marketCap ?? q?.marketCap ?? null) as number | null;
  const adv3m = (s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? null) as number | null;

  return { ticker, price, changePct, dayHigh, dayLow, prevClose, marketCap, adv3m };
}
