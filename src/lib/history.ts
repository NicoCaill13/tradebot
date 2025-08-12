// src/lib/history.ts
// Unified helper for fetching daily OHLC via yahoo-finance2 chart()
import YahooFinance from 'yahoo-finance2';
import dayjs from 'dayjs';

export type DailyBar = { close: number; high: number; low: number };

const yahoo = new (YahooFinance as any)();


export async function dailyQuotes(ticker: string, months = 6): Promise<DailyBar[]> {
  const period1 = dayjs().subtract(months, 'month').toDate();
  const period2 = new Date();
  const ch = await yahoo.chart(ticker, { period1, period2, interval: '1d', events: 'history' }) as any;
  return (ch?.quotes ?? []) as DailyBar[];
}
