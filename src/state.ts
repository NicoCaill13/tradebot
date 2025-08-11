import { promises as fs } from 'fs';
import { DATA_DIR, STATE_FILE, TODAY } from './env.js';
import type { StateShape, StatePosition } from './types.js';
import { CONFIG } from './config.js';

export function emptyState(): StateShape {
  return {
    createdAt: TODAY,
    updatedAt: TODAY,
    capital: CONFIG.capital,
    positions: CONFIG.positions.reduce<Record<string, StatePosition>>((acc, p) => {
      acc[p.ticker] = {
        ticker: p.ticker,
        targetWeight: p.targetWeight,
        shares: 0,
        avgCost: 0,
        invested: 0,
        highWatermark: 0,
        trailingStopPct: p.stops.trailingPct,
        trailingStopPrice: null,
        trancheIndexFilled: -1,
        realizedPnL: 0,
        lastAction: null,
        notes: p.notes ?? '',
      };
      return acc;
    }, {})
  };
}

export async function loadState(): Promise<StateShape> {
  await fs.mkdir(DATA_DIR, { recursive: true }); // TS trick: ensure bool literal
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as StateShape;
  } catch {
    const st = emptyState();
    await saveState(st);
    return st;
  }
}

export async function saveState(state: StateShape): Promise<void> {
  state.updatedAt = TODAY;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export function applyOrderToState(statePos: StatePosition, order: any, execPx: number): StatePosition {
  const s: StatePosition = { ...statePos };
  if (order.side === 'BUY') {
    const cost = execPx * order.shares;
    const newShares = s.shares + order.shares;
    s.avgCost = newShares === 0 ? 0 : (s.avgCost * s.shares + cost) / newShares;
    s.shares = newShares;
    s.invested += cost;
    s.trancheIndexFilled += 1;
  } else { // SELL
    const pnl = (execPx - s.avgCost) * order.shares;
    s.shares = Math.max(0, s.shares - order.shares);
    if (s.shares === 0) s.avgCost = 0;
    s.realizedPnL += pnl;
    s.invested = Math.max(0, s.invested - (s.avgCost * order.shares));
  }
  s.lastAction = { ...order, executedPrice: execPx };
  return s;
}
