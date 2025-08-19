// src/lib/discover.ts
// Découverte avec pré-filtres (1) type/nom, (2) market cap, (3) prix USD.
// Le reste (région, etc.) reste inchangé. buildDiscover() ne prend PAS d'argument.

import { yfScreener, yfQuote, yfQuoteSummary } from './yf.js';
import { priceToUSD } from './fx.js';
import { matchRegion } from './regions.js';
import { ALLOWED_SCR_IDS, ScrId, Region } from '../types.js';
import {
  REGION,
  MIN_PRICE_USD,
  MAX_PRICE_USD,
  MIN_CAP_USD,
  MAX_CAP_USD,
  YF_MAX_CONCURRENCY,
  ALLOW_SECURITY_TYPES,
  EXCLUDE_NAME_PATTERNS,
} from '../settings.js';

// -------- utils --------
async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R | null>
): Promise<R[]> {
  const out: (R | null)[] = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit || 1, arr.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;
      try { out[idx] = await fn(arr[idx], idx); } catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is R => v != null);
}

function asRegion(input: unknown): Region {
  const v = String(input ?? '').toUpperCase();
  switch (v) {
    case 'US':  return Region.US;
    case 'EU':  return Region.EU;
    default:    return Region.ALL; // fallback
  }
}


function normalizeTypes(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(s => String(s).trim().toUpperCase()).filter(Boolean);
  if (val == null) return ['EQUITY','COMMON_STOCK'];
  return String(val).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}
const ALLOWED_TYPES = normalizeTypes(ALLOW_SECURITY_TYPES);
const EXCLUDE_RX = new RegExp(
  (EXCLUDE_NAME_PATTERNS && String(EXCLUDE_NAME_PATTERNS).trim()) || 'ETF|Fund|Trust|Closed-End|ETN|Notes',
  'i'
);

// -------- 1) récupérer des seeds via les screeners --------
async function pullCandidates(): Promise<string[]> {
  const set = new Set<string>();
  const region: Region = asRegion(REGION);
  for (const scr of ALLOWED_SCR_IDS) {
    try {
      const res: any = await yfScreener({
        scrIds: scr as ScrId,
        count: 200,
        region,
      }).catch(() => null);      const items: any[] = res?.finance?.result?.[0]?.quotes || res?.quotes || [];
      for (const it of items) {
        const t = String(it?.symbol || it?.ticker || it).toUpperCase();
        if (t) set.add(t);
      }
    } catch { /* ignore */ }
  }
  // on garde large, scan/plan resserreront ensuite
  return Array.from(set).slice(0, 400);
}

// -------- 2) filtres (1)(2)(3) + région --------
async function keepEligible(tickers: string[]): Promise<string[]> {
  const results = await mapLimit(tickers, YF_MAX_CONCURRENCY || 4, async (symbol) => {
    // quotes + summary
    const [q, s]: any = await Promise.all([
      yfQuote(symbol),
      yfQuoteSummary(symbol, ['price', 'summaryDetail', 'quoteType']),
    ]);

    // --- (1) Type & Nom ---
    const qt = String(s?.quoteType?.quoteType ?? '').toUpperCase();
    if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(qt)) return null;

    const name = String(s?.price?.longName ?? s?.price?.shortName ?? '');
    if (EXCLUDE_RX.test(name)) return null;

    // --- (3) Prix USD ---
    const rawPrice = Number(q?.regularMarketPrice ?? q?.regularMarketPreviousClose ?? q?.ask ?? q?.bid ?? 0);
    const currency = String(s?.price?.currency ?? q?.currency ?? 'USD');
    const priceUSD = await priceToUSD(rawPrice, currency);
    if (!priceUSD || priceUSD < Number(MIN_PRICE_USD ?? 1) || priceUSD > Number(MAX_PRICE_USD ?? 10)) return null;

    // --- (2) Market Cap ---
    const cap = Number(s?.price?.marketCap ?? s?.summaryDetail?.marketCap ?? q?.marketCap ?? 0);
    if (Number.isFinite(cap) && cap > 0) {
      const minCap = Number(MIN_CAP_USD ?? 0);
      const maxCap = Number(MAX_CAP_USD ?? 300_000_000);
      if (minCap > 0 && cap < minCap) return null;
      if (maxCap > 0 && cap > maxCap) return null;
    }
    // (si cap inconnu -> on laisse passer, le plan pourra revalider si besoin)

    // --- Région (inchangé) ---
    const exchName = (q?.fullExchangeName || q?.exchange || '').toString();
    const exchCode = (q?.exchange || '').toString();
    const region: Region = asRegion(REGION);
    if (!matchRegion(region, symbol, exchName, exchCode)) return null;


    return symbol;
  });

  // dédup + taille raisonnable pour nourrir le plan
  return Array.from(new Set(results)).slice(0, 300);
}

// -------- API --------
export async function buildDiscover(): Promise<string[]> {
  const seeds = await pullCandidates();
  if (!seeds.length) return [];
  return keepEligible(seeds);
}
