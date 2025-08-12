import YahooFinance from 'yahoo-finance2';
import { promises as fs } from 'fs';
import path from 'path';

import { TODAY } from '../env.js';
import { ema, atr } from '../indicators.js'
import type { MarketInfo } from '../types.js';
import { loadState } from '../state.js';
import { dailyQuotes } from '../lib/history.js';

import {
  SIZING_TARGET_WEIGHT,
  SIZING_RISK_PCT,
  STOP_ATR_MULT,
  ENTRY_PULLBACK_MAX_PCT,
  FILTER_MIN_PRICE,
  FILTER_MIN_ADV_3M,
} from '../settings.js';
import { MICROCAP_LIMIT } from '../constants.js';
import { sizeByPortfolio } from '../lib/sizing.js';

const fmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);

const yahoo = new (YahooFinance as any)();

// Market fetch (quote + cap + ADV)
async function fetchMarket(ticker: string): Promise<MarketInfo> {
  const [q, s] = await Promise.all([
    yahoo.quote(ticker) as Promise<any>,
    yahoo.quoteSummary(ticker, { modules: ['price', 'summaryDetail', 'calendarEvents'] }) as Promise<any>,
  ]);
  const price = (q?.regularMarketPrice ?? null) as number | null;
  const changePct = (q?.regularMarketChangePercent ?? null) as number | null;
  const dayHigh = (q?.regularMarketDayHigh ?? null) as number | null;
  const dayLow = (q?.regularMarketDayLow ?? null) as number | null;
  const prevClose = (q?.regularMarketPreviousClose ?? null) as number | null;
  const marketCap = (s?.price?.marketCap ?? q?.marketCap ?? null) as number | null;
  const adv3m = (s?.summaryDetail?.averageDailyVolume3Month ?? q?.averageDailyVolume3Month ?? null) as number | null;
  return { ticker, price, changePct, dayHigh, dayLow, prevClose, marketCap, adv3m };
}

// Main (no user params — the strategy decides)
export async function runScan() {
  // Watchlist
  const full = path.join(process.cwd(), 'watchlist.txt');
  const raw = await fs.readFile(full, 'utf8').catch(() => '');
  const tickers = raw.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim().toUpperCase()).filter(s => s && !s.startsWith('#'));

  if (tickers.length === 0) {
    console.log(`Watchlist vide (${full}). Ajoute des tickers (1 par ligne).`);
    return;
  }

  // Capital & cash dispo (capital - MTM)
  const state = await loadState();
  const capitalUSD = state.capital;
  const held = Object.values(state.positions).filter(p => p.shares > 0);
  let mtm = 0;
  if (held.length) {
    const quotes = await Promise.all(held.map(p => yahoo.quote(p.ticker) as Promise<any>));
    for (let i = 0; i < held.length; i++) {
      const px = quotes[i]?.regularMarketPrice ?? 0;
      mtm += (px || 0) * held[i].shares;
    }
  }
  const availableCashUSD = Math.max(0, capitalUSD - mtm);

  type Row = {
    Ticker: string;
    Last: string;
    Entry: string;   // price | shares
    STOP: string;
    TP1: string;
    TP2: string;
    R: string;       // $ gain to TP1/TP2 and multiples
    Alloc: string;   // % of capital and limiting constraint
    Notes: string;
  };
  const rows: Row[] = [];

  for (const t of tickers) {
    try {
      const mkt = await fetchMarket(t);
      if (!mkt.price || !mkt.marketCap || mkt.marketCap > MICROCAP_LIMIT || (mkt.adv3m ?? 0) < FILTER_MIN_ADV_3M || mkt.price < FILTER_MIN_PRICE) {
        rows.push({ Ticker: t, Last: fmt(mkt.price ?? null), Entry: '—', STOP: '—', TP1: '—', TP2: '—', R: '—', Alloc: '—', Notes: 'Filtre: cap/liquidité/prix' });
        continue;
      }

    const hist = await dailyQuotes(t);

      if (!hist || hist.length < 50) {
        rows.push({ Ticker: t, Last: fmt(mkt.price), Entry: '—', STOP: '—', TP1: '—', TP2: '—', R: '—', Alloc: '—', Notes: 'Historique insuffisant' });
        continue;
      }

      const closes = hist.map(h => h.close);
      const highs  = hist.map(h => h.high);
      const lows   = hist.map(h => h.low);

      const ema20 = ema(closes, 20).at(-1)!;
      const atr14 = atr(highs, lows, closes, 14).at(-1)!;

      // Entry: pullback vers EMA20 (max 2% au-dessus)
      const rawEntry = mkt.price!;
      const dipEntry = Math.min(rawEntry, Math.max(ema20, rawEntry * (1 - ENTRY_PULLBACK_MAX_PCT)));


      // STOP: 2×ATR sous l’entrée
      const stop = Math.max(0.01, dipEntry - STOP_ATR_MULT * atr14);

      // TP: 1.5R / 3R
      const R = dipEntry - stop;
      const tp1 = dipEntry + 1.5 * R;
      const tp2 = dipEntry + 3 * R;

      // Sizing décidé par le portefeuille
      const sizing = sizeByPortfolio({
        capitalUSD, 
        availableCashUSD, 
        entry: dipEntry, 
        stop,
        adv3m: mkt.adv3m ?? null,
        targetWeight: SIZING_TARGET_WEIGHT,
        riskPct: SIZING_RISK_PCT,
      });
      
      const allocPct = capitalUSD > 0 ? (sizing.cost / capitalUSD) : 0;

      const notes: string[] = [];
      const uptrend = closes.at(-1)! > ema20 && ema20 > ema(closes, 50).at(-1)!;
      notes.push(uptrend ? 'Uptrend ✅' : 'Range/Downtrend');
      if (sizing.limiting === 'risk') notes.push('Cappé par risque');
      if (sizing.limiting === 'adv') notes.push('Cappé par ADV');
      if (sizing.limiting === 'cash') notes.push('Cappé par cash');

      // Optionnel: proximité 52w high
      const s = await yahoo.quoteSummary(t, { modules: ['summaryDetail'] }) as any;
      const high52 = s?.summaryDetail?.fiftyTwoWeekHigh ?? null;
      if (high52 && mkt.price && mkt.price >= 0.9 * high52) notes.push('Near 52w high');

      rows.push({
        Ticker: t,
        Last: fmt(mkt.price),
        Entry: `${fmt(dipEntry)} | ${sizing.shares} sh`,
        STOP: fmt(stop),
        TP1: fmt(tp1),
        TP2: fmt(tp2),
        R: `${(tp1 - dipEntry).toFixed(2)}/${(tp2 - dipEntry).toFixed(2)} (1.5R/3R)`,
        Alloc: `${(allocPct * 100).toFixed(1)}% (limite: ${sizing.limiting})`,
        Notes: notes.join(' · '),
      });
    } catch {
      rows.push({ Ticker: t, Last: '—', Entry: '—', STOP: '—', TP1: '—', TP2: '—', R: '—', Alloc: '—', Notes: 'Erreur fetch' });
    }
  }

  console.log(`=== SCAN — ${TODAY} ===`);
  console.table(rows);
}


