export type Side = 'BUY' | 'SELL';
export type OrderType = 'LIMIT';

export interface MarketInfo {
  ticker: string;
  price: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
  marketCap: number | null;
  adv3m: number | null;
}

export interface OrderSuggestion {
  time: string;             // ISO
  side: Side;
  type: OrderType;          // LIMIT (suggestion)
  ticker: string;
  shares: number;           // integer >= 0
  priceHint: number | null; // near-mkt reference
  reason: string;
}

export interface StatePosition {
  ticker: string;
  targetWeight: number;
  shares: number;
  avgCost: number;
  invested: number;
  highWatermark: number;
  trailingStopPct: number;
  trailingStopPrice: number | null;
  trancheIndexFilled: number;
  realizedPnL: number;
  lastAction: (OrderSuggestion & { executedPrice: number }) | null;
  notes: string;
}

export interface StateShape {
  createdAt: string; // YYYY-MM-DD
  updatedAt: string; // YYYY-MM-DD
  capital: number;   // USD
  positions: Record<string, StatePosition>;
}

export enum Region {
  US = 'US',
  EU = 'EU',
  ALL = 'ALL',
}