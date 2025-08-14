import YahooFinance from 'yahoo-finance2';

export enum Region { US = 'US', EU = 'EU', ALL = 'ALL' }

export type DailyBar = {
  date: Date;
  open: number; high: number; low: number; close: number; volume: number;
};

export const yahoo = new (YahooFinance as any)();