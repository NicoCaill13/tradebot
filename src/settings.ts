// src/settings.ts
import 'dotenv/config';

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function pct(name: string, def: number): number {
  // accepte 0.06 ou "6%" côté .env
  const v = process.env[name];
  if (v == null || v === '') return def;
  const s = v.toString().trim();
  const n = s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s);
  return Number.isFinite(n) ? n : def;
}
function str(name: string, def: string): string {
  const v = process.env[name];
  return (v == null || v === '') ? def : String(v);
}
function regex(name: string, def: RegExp): RegExp {
  const v = process.env[name];
  try {
    return v ? new RegExp(v, 'i') : def;
  } catch {
    return def;
  }
}
function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export const CAPITAL_DEFAULT          = num('CAPITAL_DEFAULT', 100000);
export const CAPITAL_SYNC_WITH_ENV = bool('CAPITAL_SYNC_WITH_ENV', false);

export const FILTER_MARKET_CAP_MAX    = num('FILTER_MARKET_CAP_MAX', 300_000_000);
export const FILTER_MIN_PRICE         = num('FILTER_MIN_PRICE', 1);
export const FILTER_MIN_ADV_3M        = num('FILTER_MIN_ADV_3M', 100_000);
export const FILTER_EXCH_REGEX = regex('FILTER_EXCH_REGEX', /(NYSE|Nasdaq|NCM|NMS|NYQ|NGM|AMEX)/i);

export const SIZING_TARGET_WEIGHT     = pct('SIZING_TARGET_WEIGHT', 0.06);
export const SIZING_RISK_PCT          = pct('SIZING_RISK_PCT', 0.0075);
export const SIZING_ADV_PCT_CAP       = pct('SIZING_ADV_PCT_CAP', 0.15);

export const ENTRY_PULLBACK_MAX_PCT   = pct('ENTRY_PULLBACK_MAX_PCT', 0.02);
export const ENTRY_MARKET_THRESHOLD_PCT = pct('ENTRY_MARKET_THRESHOLD_PCT', 0.005);
export const STOP_ATR_MULT            = num('STOP_ATR_MULT', 2);

export const OUT_DIR_ENV              = str('OUT_DIR', 'out');
export const DATA_DIR_ENV              = str('OUT_DIR', 'out');
