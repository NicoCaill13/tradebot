
export enum Region { US = 'US', EU = 'EU', ALL = 'ALL' }

export type DailyBar = {
  date: Date;
  open: number; high: number; low: number; close: number; volume: number;
};
export const ALLOWED_SCR_IDS = [
  'aggressive_small_caps',
  'conservative_foreign_funds',
  'day_gainers',
  'day_losers',
  'growth_technology_stocks',
  'high_yield_bond',
  'most_actives',
  'most_shorted_stocks',
  'portfolio_anchors',
  'small_cap_gainers',
  'solid_large_growth_funds',
  'solid_midcap_growth_funds',
  'top_mutual_funds',
  'undervalued_growth_stocks',
  'undervalued_large_caps',
] as const;

export type ScrId = typeof ALLOWED_SCR_IDS[number];

export const NO_VALIDATE = { validateResult: false } as const;
