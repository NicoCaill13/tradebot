
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

export type Bar = { date: Date; open: number; high: number; low: number; close: number; volume: number };

export type ReviewCandidate = {
  ticker: string;
  close: number;
  high: number;
  low: number;
  rangePct: number;      // (high-low)/mid
  trend: 'OFF'|'WEAK'|'BASIC';
  marketCap?: number;
  adv3m?: number;
  plan: {                // ce que ton algo a calculé
    entry: number;
    stop: number;
    tp1: number;
    tp2: number;
    shares: number;
  };
};

export type ReviewDecision = {
  ticker: string;
  allow: boolean;
  rank: number;                  // 1 = meilleur
  confidence: number;            // 0..1
  reasons: string[];             // puces courtes
  // Ajustements facultatifs si AI_TARGET_MODE=RELAX
  adjust?: Partial<{ entry: number; stop: number; tp1: number; tp2: number; shares: number }>;
};

export type PlanRow = {
  ticker: string;
  signalDate: string; // ISO (last daily bar)
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  shares: number;
  meta: {
    close: number;
    rangePct: number;
    volLast: number;
    trendUsed: 'OFF' | 'WEAK' | 'BASIC';
    marketCap?: number;
  };
};

export type TrendUsed = 'OFF' | 'WEAK' | 'BASIC';