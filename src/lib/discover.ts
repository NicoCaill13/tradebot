// src/lib/universe.ts
import { yfScreener, yfQuote, yfQuoteSummary } from './yf.js';
import { priceToUSD } from './fx.js';
import { matchRegion } from './regions.js';
import { ALLOWED_SCR_IDS, ScrId } from '../types.js';
import {
  REGION,
  MIN_PRICE_USD,
  MAX_PRICE_USD,
  MIN_ADV_3M,
  YF_MAX_CONCURRENCY,
} from '../settings.js';

// exécuteur parallèle borné
async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R | null>
): Promise<R[]> {
  const out: (R | null)[] = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;
      try {
        out[idx] = await fn(arr[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is R => v != null);
}

// 1) seeds depuis les screeners officiels de la lib
async function pullCandidates(): Promise<string[]> {
  const set = new Set<string>();
  for (const scr of ALLOWED_SCR_IDS) {
    try {
      const res: any = await yfScreener(scr as ScrId, 200).catch(() => null);
      const items: any[] = res?.finance?.result?.[0]?.quotes || res?.quotes || [];
      for (const it of items) {
        const t = String(it?.symbol || it?.ticker || it).toUpperCase();
        if (t) set.add(t);
      }
    } catch {
      // ignore
    }
  }
  return Array.from(set).slice(0, 250);
}

// 2) filtres région + prix USD + ADV
async function keepEligible(tickers: string[]): Promise<string[]> {
  const results = await mapLimit(tickers, YF_MAX_CONCURRENCY || 4, async (symbol) => {
    const [q, s]: any = await Promise.all([
      yfQuote(symbol),
      yfQuoteSummary(symbol, ['price', 'summaryDetail']),
    ]);

    const price = Number(q?.regularMarketPrice ?? 0);
    const currency = String(s?.price?.currency ?? q?.currency ?? 'USD');
    const priceUSD = await priceToUSD(price, currency);

    const adv = Number(
      s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? 0
    );

    const exchName = (q?.fullExchangeName || q?.exchange || '').toString();
    const exchCode = (q?.exchange || '').toString();

    if (!matchRegion(REGION, symbol, exchName, exchCode)) return null;
    if (!priceUSD || priceUSD < MIN_PRICE_USD || priceUSD > MAX_PRICE_USD) return null;
    if (!adv || adv < MIN_ADV_3M) return null;

    return symbol;
  });

  return Array.from(new Set(results)).slice(0, 50);
}

export async function buildDiscover(): Promise<string[]> {
  const seeds = await pullCandidates();
  if (!seeds.length) return [];
  return keepEligible(seeds);
}
