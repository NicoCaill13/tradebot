// src/lib/levels.ts
import { Bar } from '../types.js';

/** Dernier jour dispo dans la série daily */
export function lastDaily(bars: Bar[]): Bar | null {
  if (!bars?.length) return null;
  return bars[bars.length - 1];
}

/** YHigh/YLow/YClose/Date (prend la dernière bougie daily dispo) */
export function yhl(barsDaily: Bar[]) {
  const last = lastDaily(barsDaily);
  if (!last) return null;
  const yHigh = Number(last.high);
  const yLow  = Number(last.low);
  const yClose = Number(last.close);
  const yDate = (last.date instanceof Date ? last.date.toISOString() : String(last.date));
  if (![yHigh, yLow, yClose].every(Number.isFinite)) return null;
  return { yHigh, yLow, yClose, yDate };
}

/** Agrégation 60m -> 4H (simple: 4 bougies de 60m = 1 bougie 4H) */
export function to4H(bars60m: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars60m.length; i += 4) {
    const group = bars60m.slice(i, i + 4);
    if (!group.length) continue;
    const open = Number(group[0].open);
    const close = Number(group[group.length - 1].close);
    const high = Math.max(...group.map(b => Number(b.high)));
    const low  = Math.min(...group.map(b => Number(b.low)));
    const volume = group.reduce((sum, b) => sum + Number(b.volume ?? 0), 0);
    const date = group[group.length - 1].date;
    out.push({ date, open, high, low, close, volume });
  }
  return out;
}

/** Détection de résistances par swing-highs 4H ; renvoie la plus proche AU-DESSUS d'entry */
export function nearest4hResistanceAbove(entry: number, bars4h: Bar[], lookback = 180): number | null {
  if (!bars4h?.length) return null;
  const n = Math.min(lookback, bars4h.length);
  let best: number | null = null;

  for (let i = 1; i < n - 1; i++) {
    const h0 = Number(bars4h[i - 1].high);
    const h1 = Number(bars4h[i].high);
    const h2 = Number(bars4h[i + 1].high);
    if (![h0, h1, h2].every(Number.isFinite)) continue;

    const isSwingHigh = h1 > h0 && h1 > h2;
    if (!isSwingHigh) continue;

    if (h1 > entry) {
      if (best == null || h1 < best) best = h1;
    }
  }
  return best;
}
