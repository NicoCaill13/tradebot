// src/lib/yf.ts
import yahooFinance from 'yahoo-finance2';

const TIMEOUT = Number(process.env.YF_TIMEOUT_MS ?? 8000);

// -------- Types
export type ChartOpts = {
  interval: '1d' | '60m' | '30m' | '15m' | '5m' | '1m';
  range?: string;                   // '20d' | '60d' | '1y' ...
  period1?: Date | number | string; // si pas de range, fournir p1/p2
  period2?: Date | number | string;
  includePrePost?: boolean;
};
export type QuoteSummaryModule =
  | 'price' | 'summaryDetail' | 'assetProfile' | 'quoteType'
  | 'financialData' | 'calendarEvents' | 'earnings' | 'earningsTrend'
  | 'balanceSheetHistory' | 'balanceSheetHistoryQuarterly'
  | 'cashflowStatementHistory' | 'cashflowStatementHistoryQuarterly'
  | 'incomeStatementHistory' | 'incomeStatementHistoryQuarterly'
  | 'recommendationTrend' | 'upgradeDowngradeHistory';


// -------- Wrappers sûrs
export async function yfChart(symbol: string, opts: ChartOpts) {
  const o: any = {
    interval: opts.interval,
    includePrePost: !!opts.includePrePost,
  };
  if (opts.range) {
    o.range = opts.range; // évite l’erreur /period1
  } else {
    o.period1 = opts.period1 ?? new Date(Date.now() - 90 * 864e5);
    o.period2 = opts.period2 ?? new Date();
  }
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];

  if (String(process.env.DEBUG_PLAN || '') === '1') {
    console.warn('[yfChart]', symbol, JSON.stringify(o, (k,v)=> {
      if (v instanceof Date) return v.toISOString();
      return v;
    }));
  }
  return yahooFinance.chart(symbol, o, {
    validateResult: false,
    fetchOptions: { timeout: TIMEOUT },
  });
}

export async function yfQuote(symbol: string) {
  return yahooFinance.quote(symbol, {}, {
    validateResult: false,
    fetchOptions: { timeout: TIMEOUT },
  });
}

export async function yfQuoteSummary(symbol: string, modules: readonly QuoteSummaryModule[] | readonly string[]) {
  return yahooFinance.quoteSummary(symbol, { modules: modules as any }, {
    validateResult: false,
    fetchOptions: { timeout: TIMEOUT },
  });
}

export async function yfScreener(args: { scrIds: string; count?: number; region?: string; lang?: string; }) {
  const { scrIds, count = 100, region, lang } = args;
  const q: any = { scrIds: scrIds as any, count };
  if (region) q.region = region;
  if (lang)   q.lang   = lang;
  return yahooFinance.screener(q, {
    validateResult: false,
    fetchOptions: { timeout: TIMEOUT },
  });
}

yahooFinance.suppressNotices?.(['yahooSurvey', 'ripHistorical']);
