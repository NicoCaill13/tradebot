import 'dotenv/config';
import path from 'path';
import { Region } from './types.js';

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

const pct = (k: string, d: number) => {
  const v = process.env[k]; if (v == null || v === '') return d;
  const s = String(v).trim(); const n = s.endsWith('%') ? Number(s.slice(0,-1))/100 : Number(s);
  return Number.isFinite(n) ? n : d;
};


// --- Yahoo fetch guard ---
export const YF_TIMEOUT_MS = num('YF_TIMEOUT_MS', 8000);       // 8s par requête
export const YF_MAX_CONCURRENCY = num('YF_MAX_CONCURRENCY', 4); // appels parallèles max
export const YF_COOKIES = str('YF_COOKIES', '');     

export const REGION = parseRegion(process.env.REGION);
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



export const ORDER_MAX_NOTIONAL_PCT   = pct('ORDER_MAX_NOTIONAL_PCT', 0.25);
export const DAILY_NOTIONAL_BUDGET_PCT= pct('DAILY_NOTIONAL_BUDGET_PCT', 1.0);
export const DAILY_RISK_BUDGET_PCT    = pct('DAILY_RISK_BUDGET_PCT', 0.20);
export const MAX_TRADES_PER_DAY       = num('MAX_TRADES_PER_DAY', 8);
export const MAX_TRADES_PER_SIDE      = num('MAX_TRADES_PER_SIDE', PLAN_MAX_PER_SIDE);
export const INCLUDE_FUNDS            = bool('INCLUDE_FUNDS', true);



export const SCAN_INTERVAL = (process.env.SCAN_INTERVAL ?? '1m') as '1m' | '5m';
export const BB_PERIOD = Number(process.env.BB_PERIOD ?? 20);
export const SWING_LOOKBACK = Number(process.env.SWING_LOOKBACK ?? 10);
export const INTRA_LOOKBACK_MIN = Number(process.env.INTRA_LOOKBACK_MIN ?? 120);

export const SIGNAL_TF = (process.env.SIGNAL_TF ?? '1H') as '1H' | '4H';
export const HR_LOOKBACK_DAYS = Number(process.env.HR_LOOKBACK_DAYS ?? 15);

export const BB_PERIOD_HR = Number(process.env.BB_PERIOD_HR ?? 20);
export const BB_STD = Number(process.env.BB_STD ?? 2);
export const EMA_FAST_HR = Number(process.env.EMA_FAST_HR ?? 20);
export const EMA_SLOW_HR = Number(process.env.EMA_SLOW_HR ?? 50);



export const ALLOW_TREND_FALLBACK =
  (process.env.ALLOW_TREND_FALLBACK ?? 'true').toLowerCase() === 'true';

export const TREND_MODE = (process.env.TREND_MODE ?? 'AUTO') as
  'STRICT' | 'RELAX' | 'EASY' | 'AUTO';
export const RVOL_MIN = Number(process.env.RVOL_MIN ?? 1.10);


export const SIGNAL_MODE = (process.env.SIGNAL_MODE ?? 'CLOSE_OR_TOUCH') as 'CLOSE_ONLY' | 'CLOSE_OR_TOUCH';
export const RVOL_LOOKBACK = Number(process.env.RVOL_LOOKBACK ?? 20);
export const MIN_TF_BARS = Number(process.env.MIN_TF_BARS ?? 3);

// --- Strategy core (breakout daily d'hier) ---
export const ENTRY_BUFFER_PCT = Number(process.env.ENTRY_BUFFER_PCT ?? 0.001);  // +0.10%
export const STOP_BUFFER_PCT  = Number(process.env.STOP_BUFFER_PCT  ?? 0.001);  // -0.10%
export const TP1_MULT         = Number(process.env.TP_R_MULT_1 ?? 1.5);
export const TP2_MULT         = Number(process.env.TP_R_MULT_2 ?? 3.0);

// --- Sizing / exécution ---
export const MIN_SHARES       = Number(process.env.MIN_SHARES ?? 1);
export const MIN_NOTIONAL_USD = Number(process.env.MIN_NOTIONAL_USD ?? 0);

// --- Filtres progressifs (daily only) ---
export const MIN_PRICE_USD    = Number(process.env.MIN_PRICE_USD ?? 0);  // 0 => pas de filtre
export const MAX_PRICE_USD    = Number(process.env.MAX_PRICE_USD ?? 0);
export const FILTER_MIN_RANGE_PCT = Number(process.env.FILTER_MIN_RANGE_PCT ?? 0.005); // 0,5%
export const FILTER_MAX_RANGE_PCT = Number(process.env.FILTER_MAX_RANGE_PCT ?? 0.25);  // 25%
export const TREND_FILTER = (process.env.TREND_FILTER ?? 'WEAK') as 'OFF' | 'WEAK' | 'BASIC';
export const MIN_VOL_LAST     = Number(process.env.MIN_VOL_LAST ?? 0);
// tu as déjà MIN_ADV_3M dans ce fichier ; on réutilise le même export

// --- Limites d'output ---
export const PLAN_MAX_ROWS    = Number(process.env.PLAN_MAX_ROWS ?? 100);

// --- Règles swing / risk mgmt (affichées pour transparence) ---
export const TIME_STOP_FRIDAY = (process.env.TIME_STOP_FRIDAY ?? 'true').toLowerCase() === 'true';
export const INVALIDATE_ON_DAILY_SMA20_BREAK =
  (process.env.INVALIDATE_ON_DAILY_SMA20_BREAK ?? 'true').toLowerCase() === 'true';
export const GAP_REANCHOR_PCT = Number(process.env.GAP_REANCHOR_PCT ?? 0.01); // 1% gap → réancrer le trigger

export const MIN_CAP_USD = Number(process.env.MIN_CAP_USD ?? 0);
export const MAX_CAP_USD = Number(process.env.MAX_CAP_USD ?? 300_000_000);

export const ALLOW_SECURITY_TYPES =
  (process.env.ALLOW_SECURITY_TYPES ?? 'EQUITY,COMMON_STOCK')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

export const EXCLUDE_NAME_PATTERNS =
  (process.env.EXCLUDE_NAME_PATTERNS ?? 'ETF|Fund|Trust|Closed-End|ETN|Notes')
    .split('|').map(s => s.trim()).filter(Boolean);

