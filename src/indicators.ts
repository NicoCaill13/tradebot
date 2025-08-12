// src/indicators.ts
// Lightweight indicator helpers (EMA, ATR)

export function ema(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const out: number[] = [];
    let prev = values[0];
    out.push(prev);
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      const next = v * k + prev * (1 - k);
      out.push(next);
      prev = next;
    }
    return out;
  }
  
  export function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
    const n = Math.min(highs.length, lows.length, closes.length);
    if (n === 0) return [];
    const tr: number[] = [];
    for (let i = 0; i < n; i++) {
      const h = highs[i];
      const l = lows[i];
      const pc = i > 0 ? closes[i - 1] : closes[i];
      const a = h - l;
      const b = Math.abs(h - pc);
      const c = Math.abs(l - pc);
      tr.push(Math.max(a, b, c));
    }
    return ema(tr, period);
  }
  