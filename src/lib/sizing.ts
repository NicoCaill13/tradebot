import { ADV_PCT_CAP } from '../constants.js';
import {
  SIZING_TARGET_WEIGHT,
  SIZING_RISK_PCT
} from '../settings.js';

export type LimitTag = 'weight' | 'risk' | 'cash' | 'adv';

export interface SizePortfolioArgs {
  capitalUSD: number;
  availableCashUSD: number;
  entry: number;
  stop: number;
  adv3m: number | null;
  targetWeight: number; // e.g. 0.06
  riskPct: number;      // e.g. 0.0075
}

export interface SizePortfolioOut {
  shares: number;
  cost: number;
  limiting: LimitTag;
}

export function sizeByPortfolio(args: SizePortfolioArgs): SizePortfolioOut {
  const { capitalUSD, availableCashUSD, entry, stop, adv3m, targetWeight, riskPct } = args;
  const perShareRisk = Math.max(0.0001, entry - stop);
  const sharesByWeight = Math.floor((capitalUSD * targetWeight) / entry);
  const sharesByRisk   = Math.floor((capitalUSD * riskPct)   / perShareRisk);
  const sharesByCash   = Math.floor(availableCashUSD / entry);
  const sharesByADV    = adv3m && adv3m > 0 ? Math.floor(adv3m * ADV_PCT_CAP) : Number.POSITIVE_INFINITY;
  const candidates = [
    { tag: 'weight' as const, shares: sharesByWeight },
    { tag: 'risk'   as const, shares: sharesByRisk },
    { tag: 'cash'   as const, shares: sharesByCash },
    { tag: 'adv'    as const, shares: sharesByADV },
  ];
  const winner = candidates.reduce((min, c) => (c.shares < min.shares ? c : min));
  const shares = Math.max(0, winner.shares);
  const cost = shares * entry;
  return { shares, cost, limiting: winner.tag };
}

export function decideSizeWithDefaults(
  { capitalUSD, availableCashUSD, entry, stop, adv3m }:
  { capitalUSD: number; availableCashUSD: number; entry: number; stop: number; adv3m: number | null; }
): SizePortfolioOut {
  return sizeByPortfolio({
    capitalUSD,
    availableCashUSD,
    entry,
    stop,
    adv3m,
    targetWeight: SIZING_TARGET_WEIGHT,
    riskPct: SIZING_RISK_PCT,
  });
}
