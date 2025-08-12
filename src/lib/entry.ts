import {
    ENTRY_MARKET_THRESHOLD_PCT,
    STOP_ATR_MULT,
    ENTRY_PULLBACK_MAX_PCT,
  } from '../settings.js';

export function computeEntry(price: number, ema20: number): number {
  // Pullback to EMA20, bounded by -2% from current price
  return Math.min(price, Math.max(ema20, price * (1 - ENTRY_PULLBACK_MAX_PCT)));
}

export function computeStop(entry: number, atr14: number): number {
  return Math.max(0.01, entry - STOP_ATR_MULT * atr14);
}

export function computeTPs(entry: number, stop: number): { tp1: number; tp2: number; R: number } {
  const R = entry - stop;
  return { tp1: entry + 1.5 * R, tp2: entry + 3 * R, R };
}

export function decideAction(price: number | null, entry: number): string {
  if (price == null) return `BUY LIMIT @ $${entry.toFixed(4)}`;
  const diffPct = Math.abs((price - entry) / entry);
  if (diffPct <= ENTRY_MARKET_THRESHOLD_PCT) {
    return `BUY @ MKT (Δ ${(diffPct * 100).toFixed(1)}%)`;
  }
  return `BUY LIMIT @ $${entry.toFixed(4)} (Δ ${(diffPct * 100).toFixed(1)}%)`;
}
