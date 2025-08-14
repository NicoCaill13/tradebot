import { yahoo } from '../types.js';
import { priceToUSD } from '../lib/fx.js';
import { matchRegion } from '../lib/regions.js';
import { Region } from '../types.js';
import { REGION, MIN_PRICE_USD, MAX_PRICE_USD, MIN_ADV_3M } from '../settings.js';

// On s'appuie sur les screeners stables (trendingSymbols est instable en EU)
const SCR_IDS = ['most_actives','day_gainers','day_losers','undervalued_growth_stocks','aggressive_small_caps'];

export async function runDiscover(): Promise<string[]> {
  const set = new Set<string>();

  for (const scr of SCR_IDS) {
    const res: any = await yahoo.screener({ scrIds: scr, count: 200 }).catch(()=>null);
    const items: any[] = res?.finance?.result?.[0]?.quotes || res?.quotes || [];
    for (const it of items) {
      const t = String(it.symbol || it.ticker || it).toUpperCase();
      if (t) set.add(t);
    }
  }

  const out: string[] = [];
  for (const symbol of set) {
    try {
      const [q, s]: any = await Promise.all([
        yahoo.quote(symbol),
        yahoo.quoteSummary(symbol, { modules: ['price','summaryDetail'] })
      ]);

      const price = Number(q?.regularMarketPrice ?? 0);
      const currency = String(s?.price?.currency ?? q?.currency ?? 'USD');
      const priceUSD = await priceToUSD(price, currency);
      const adv = Number(s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? 0);
      const exchName = (q?.fullExchangeName || q?.exchange || '').toString();
      const exchCode = (q?.exchange || '').toString();

      if (!matchRegion(REGION as Region, symbol, exchName, exchCode)) continue;
      if (!priceUSD || priceUSD < MIN_PRICE_USD || priceUSD > MAX_PRICE_USD) continue;
      if (!adv || adv < MIN_ADV_3M) continue;

      out.push(symbol);
    } catch { /* ignore */ }
  }
  return Array.from(new Set(out)).slice(0, 50);
}
