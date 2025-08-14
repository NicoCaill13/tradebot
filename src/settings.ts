import 'dotenv/config';
import path from 'path';
import { Region } from './types.js';

const num = (k: string, d: number) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  const n = Number(v); return Number.isFinite(n) ? n : d;
};
const pct = (k: string, d: number) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  const s = v.trim(); const n = s.endsWith('%') ? Number(s.slice(0,-1))/100 : Number(s);
  return Number.isFinite(n) ? n : d;
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
