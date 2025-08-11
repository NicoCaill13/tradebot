import pLimit from 'p-limit';
import dayjs from 'dayjs';
import { CONFIG } from './config.js';
import { fetchMarket } from './market.js';
import { MICROCAP_LIMIT, ADV_PCT_CAP } from './constants.js';
import { DATA_DIR, OUT_DIR, TODAY } from './env.js';
import { withinPreEventWindow, fmtUSD, pctStr } from './utils.js';
import type { PositionCfg } from './config.js';
import type { MarketInfo, OrderSuggestion, StatePosition } from './types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { loadState, saveState, applyOrderToState } from './state.js';

function maxSharesByADV(adv3m: number | null): number {
  if (!adv3m || adv3m <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(adv3m * ADV_PCT_CAP);
}

function desiredSharesForWeight(capital: number, weight: number, price: number | null): number {
  if (!price || price <= 0) return 0;
  return Math.max(0, Math.floor((capital * weight) / price));
}

export function updateTrailingStop(statePos: StatePosition, mkt: MarketInfo, trailingPct: number): StatePosition {
  const px = mkt.price ?? 0;
  const newHWM = Math.max(statePos.highWatermark || 0, px);
  const newStop = Number((newHWM * (1 - trailingPct)).toFixed(4));
  return { ...statePos, highWatermark: newHWM, trailingStopPct: trailingPct, trailingStopPrice: isFinite(newStop) ? newStop : null };
}

export function makeOrder(input: { side: 'BUY' | 'SELL'; ticker: string; shares: number; priceHint: number | null; reason: string; }): OrderSuggestion {
  return {
    time: dayjs().toISOString(),
    side: input.side,
    type: 'LIMIT',
    ticker: input.ticker,
    shares: Math.max(0, Math.floor(input.shares)),
    priceHint: input.priceHint ?? null,
    reason: input.reason,
  };
}

export function evaluateSymbol(params: {
  cfgPos: PositionCfg;
  statePos: StatePosition;
  mkt: MarketInfo;
  capital: number;
}): { orders: OrderSuggestion[]; warnings: string[]; nextState: StatePosition } {
  const { cfgPos, statePos, mkt, capital } = params;
  const orders: OrderSuggestion[] = [];
  const warnings: string[] = [];

  // Micro-cap gate
  if (mkt.marketCap && mkt.marketCap > MICROCAP_LIMIT) {
    warnings.push(`${cfgPos.ticker}: market cap ${fmtUSD(mkt.marketCap)} exceeds $300M — SKIP`);
    return { orders, warnings, nextState: statePos };
  }

  const advCapShares = maxSharesByADV(mkt.adv3m);
  const desired = desiredSharesForWeight(capital, cfgPos.targetWeight, mkt.price);
  const toBuyTotal = Math.max(0, desired - (statePos.shares || 0));

  // Tranche-based entry
  if (toBuyTotal > 0 && Array.isArray(cfgPos.entry.tranches)) {
    const nextTrancheIdx = statePos.trancheIndexFilled + 1;
    const tranches = cfgPos.entry.tranches;
    if (nextTrancheIdx < tranches.length) {
      const tranchePctOfTarget = tranches[nextTrancheIdx];
      const trancheShares = Math.floor(desired * tranchePctOfTarget);
      const dip = cfgPos.entry.buyDipPercents[nextTrancheIdx] ?? 0; // %
      const hint = mkt.price ? Number((mkt.price * (1 + (dip / 100))).toFixed(4)) : null;
      const capped = Math.min(trancheShares, advCapShares);
      if (capped > 0) {
        orders.push(makeOrder({ side: 'BUY', ticker: cfgPos.ticker, shares: capped, priceHint: hint, reason: dip === 0 ? 'Initial tranche' : `Tranche on dip ${dip}%` }));
      }
    }
  }

  // Maintain trailing stop / spike tightening
  let nextState = updateTrailingStop(statePos, mkt, statePos.trailingStopPct || cfgPos.stops.trailingPct);

  if (cfgPos.spikeRule && typeof mkt.changePct === 'number' && mkt.changePct >= cfgPos.spikeRule.pctUpDay * 100) {
    nextState = updateTrailingStop(nextState, mkt, cfgPos.spikeRule.newTrailingPct);
  }

  // Hard stop
  if (cfgPos.stops.hardStopPct && statePos.avgCost > 0 && (mkt.price ?? 0) > 0) {
    const hardStopPx = statePos.avgCost * (1 - cfgPos.stops.hardStopPct);
    if ((mkt.price as number) <= hardStopPx && statePos.shares > 0) {
      orders.push(makeOrder({ side: 'SELL', ticker: cfgPos.ticker, shares: statePos.shares, priceHint: mkt.price, reason: `Hard stop ${pctStr(cfgPos.stops.hardStopPct)}` }));
      return { orders, warnings, nextState };
    }
  }

  // Trailing stop breach
  if (nextState.trailingStopPrice && (mkt.price ?? 0) > 0 && (mkt.price as number) <= nextState.trailingStopPrice && statePos.shares > 0) {
    orders.push(makeOrder({ side: 'SELL', ticker: cfgPos.ticker, shares: statePos.shares, priceHint: mkt.price, reason: `Trailing stop ${pctStr(nextState.trailingStopPct)}` }));
  }

  // Pre-event trim
  if (cfgPos.preEventTrim?.eventDate && withinPreEventWindow(cfgPos.preEventTrim.eventDate, cfgPos.preEventTrim.windowDaysMin, cfgPos.preEventTrim.windowDaysMax)) {
    if (statePos.shares > 0) {
      const trimShares = Math.floor(statePos.shares * cfgPos.preEventTrim.trimPctOfPosition);
      if (trimShares > 0) {
        orders.push(makeOrder({ side: 'SELL', ticker: cfgPos.ticker, shares: trimShares, priceHint: mkt.price, reason: 'Pre-event risk trim' }));
      }
    }
  }

  // Take-profit ladder
  if (cfgPos.takeProfitLevels && statePos.avgCost > 0 && statePos.shares > 0 && (mkt.price ?? 0) > 0) {
    for (const tp of cfgPos.takeProfitLevels) {
      const targetPx = statePos.avgCost * (1 + tp);
      if ((mkt.price as number) >= targetPx) {
        const sell = Math.max(1, Math.floor(statePos.shares / 3));
        orders.push(makeOrder({ side: 'SELL', ticker: cfgPos.ticker, shares: sell, priceHint: mkt.price, reason: `Take-profit hit +${pctStr(tp)}` }));
      }
    }
  }

  return { orders, warnings, nextState };
}

export async function runEngine(args: { capital?: number; assumeFills?: boolean }) {
  const capital = args.capital ?? CONFIG.capital;
  const assumeFills = Boolean(args.assumeFills ?? CONFIG.assumeFills);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  let state = await loadState();
  state.capital = capital;

  const limit = pLimit(4);
  const markets = await Promise.all(CONFIG.positions.map(p => limit(() => fetchMarket(p.ticker))));

  const todays: Array<{ cfgPos: PositionCfg; st: StatePosition; mkt: MarketInfo; orders: OrderSuggestion[]; }> = [];
  const warningsAll: string[] = [];

  for (const cfgPos of CONFIG.positions) {
    const mkt = markets.find(m => m.ticker === cfgPos.ticker)!;
    const st = state.positions[cfgPos.ticker];

    const { orders, warnings, nextState } = evaluateSymbol({ cfgPos, statePos: st, mkt, capital });
    warningsAll.push(...warnings);

    // Optionally book fills immediately (paper mode)
    if (assumeFills && orders.length) {
      for (const od of orders) {
        const execPx = mkt.price ?? od.priceHint ?? 0;
        state.positions[cfgPos.ticker] = applyOrderToState(state.positions[cfgPos.ticker], od, execPx);
      }
    }

    // Always refresh trailing stops
    state.positions[cfgPos.ticker] = updateTrailingStop(state.positions[cfgPos.ticker], mkt, state.positions[cfgPos.ticker].trailingStopPct);

    todays.push({ cfgPos, st: state.positions[cfgPos.ticker], mkt, orders });
  }

  await saveState(state);

  // Write orders file
  const ordersOut = todays.flatMap(t => t.orders.map(o => ({ ...o, ticker: t.cfgPos.ticker })));
  const outPath = path.join(OUT_DIR, `orders-${TODAY}.json`);
  await fs.writeFile(outPath, JSON.stringify({ date: TODAY, assumeFills, orders: ordersOut }, null, 2));

  // Console summary
  console.log(`\n=== MICROCAP PORTFOLIO — ${TODAY} ===`);
  console.table(markets.map(m => ({
    Ticker: m.ticker,
    Price: m.price,
    'Change %': m.changePct,
    'Mkt Cap ($)': m.marketCap,
    'ADV 3m (sh)': m.adv3m,
  })));

  if (warningsAll.length) {
    console.log('\nWARNINGS:');
    warningsAll.forEach(w => console.log(' -', w));
  }

  if (ordersOut.length) {
    console.log(`\nSuggested Orders (${ordersOut.length}) → ${outPath}`);
    for (const od of ordersOut) {
      console.log(`${od.side}\t${od.ticker}\t${od.shares} sh @ ~${od.priceHint}  // ${od.reason}`);
    }
  } else {
    console.log('\nNo orders suggested today.');
  }

  // MTM rough
  let mtm = 0;
  for (const t of todays) {
    if (t.mkt.price && t.st.shares) mtm += (t.mkt.price as number) * t.st.shares;
  }
  console.log(`\nCapital: $${state.capital.toLocaleString('en-US', { maximumFractionDigits: 2 })}  |  MTM (positions): $${mtm.toLocaleString('en-US', { maximumFractionDigits: 2 })}  |  Cash (est.): $${(state.capital - mtm).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
}
