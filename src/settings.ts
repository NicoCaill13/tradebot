import 'dotenv/config';
import path from 'path';
import { Region } from './types.js';

const pct = (k: string, d: number) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  const s = String(v).trim(); const n = s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s);
  return Number.isFinite(n) ? n : d;
};
const num = (k: string, d: number) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  const n = Number(v); return Number.isFinite(n) ? n : d;
};
const bool = (k: string, d: boolean) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  return ['1','true','yes','on'].includes(String(v).toLowerCase());
};
const str = (k: string, d: string) => (process.env[k] ?? d);

function parseRegion(v?: string): Region {
  const s = (v || 'ALL').toUpperCase();
  return s === 'US' ? Region.US : s === 'EU' ? Region.EU : Region.ALL;
}


// --- Yahoo fetch guard ---
export const YF_TIMEOUT_MS = num('YF_TIMEOUT_MS', 8000);       // 8s par requête
export const YF_MAX_CONCURRENCY = num('YF_MAX_CONCURRENCY', 4); // appels parallèles max
export const YF_COOKIES = str('YF_COOKIES', '');     

export const REGION = parseRegion(process.env.REGION);
export const MIN_PRICE_USD = num('MIN_PRICE_USD', 1);
export const MAX_PRICE_USD = num('MAX_PRICE_USD', 10);
export const MIN_ADV_3M = num('MIN_ADV_3M', 30000);

export const CAPITAL_DEFAULT = num('CAPITAL_DEFAULT', 100000);
export const CAPITAL_SYNC_WITH_ENV = bool('CAPITAL_SYNC_WITH_ENV', true);
export const RISK_PER_TRADE_PCT = pct('RISK_PER_TRADE_PCT', 0.005);

export const OPENING_RANGE_MIN = num('OPENING_RANGE_MIN', 15);
export const ENTRY_MKT_THRESHOLD_PCT = pct('ENTRY_MKT_THRESHOLD_PCT', 0.003);
export const TP_R_MULT_1 = num('TP_R_MULT_1', 1.5);
export const TP_R_MULT_2 = num('TP_R_MULT_2', 3);
export const STOP_ATR_MULT = num('STOP_ATR_MULT', 2);

export const OUT_DIR = path.join(process.cwd(), str('OUT_DIR','out'));
export const DATA_DIR = path.join(process.cwd(), str('DATA_DIR','data'));

export const TODAY = new Date().toJSON();

export const OVERNIGHT_BREAK_BUFFER_PCT = pct('OVERNIGHT_BREAK_BUFFER_PCT', 0.002);
export const ENTRY_STOPLIMIT_BUFFER_PCT = pct('ENTRY_STOPLIMIT_BUFFER_PCT', 0.003);
export const PLAN_MAX_PER_SIDE = num('PLAN_MAX_PER_SIDE', 12);

export const MIN_NOTIONAL_USD = num('MIN_NOTIONAL_USD', 0);
export const MIN_SHARES = num('MIN_SHARES', 0);

export const ORDER_MAX_NOTIONAL_PCT   = pct('ORDER_MAX_NOTIONAL_PCT', 0.25);
export const DAILY_NOTIONAL_BUDGET_PCT= pct('DAILY_NOTIONAL_BUDGET_PCT', 1.0);
export const DAILY_RISK_BUDGET_PCT    = pct('DAILY_RISK_BUDGET_PCT', 0.20);
export const MAX_TRADES_PER_DAY       = num('MAX_TRADES_PER_DAY', 8);
export const MAX_TRADES_PER_SIDE      = num('MAX_TRADES_PER_SIDE', PLAN_MAX_PER_SIDE);
export const INCLUDE_FUNDS            = bool('INCLUDE_FUNDS', true);


