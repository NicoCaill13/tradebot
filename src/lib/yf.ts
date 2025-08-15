// src/lib/yf.ts
import yahooFinance from 'yahoo-finance2';
import { YF_TIMEOUT_MS, YF_COOKIES } from '../settings.js';

// ---- withTimeout : coupe court si Yahoo met trop longtemps ----
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout ${ms}ms on ${label}`)), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}
const MODULE_OPTS = { validateResult: false } as const;

let _inited = false;

export async function initYahooQuietly() {
  if (_inited) return;
  _inited = true;

  // Supprime la notice "yahooSurvey" si dispo dans ta version
  try {
    (yahooFinance as any).suppressNotices?.(['yahooSurvey']);
  } catch {}

  // Warm-up (récupère crumb/cookies) en silencieux
  const origLog = console.log;
  const origWarn = console.warn;
  const origInfo = console.info;
  try {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    await yfQuote('AAPL').catch(() => null);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.info = origInfo;
  }
}

// ---- queryOptions overrides : on peut injecter des headers/cookies ----
function qOpts(extra?: any) {
  const headers: Record<string, string> = {};
  if (YF_COOKIES) headers['Cookie'] = YF_COOKIES;
  return { ...(extra || {}), headers };
}

// ---- Wrappers sûrs (on passe par any pour éviter les unions de littéraux) ----
export async function yfQuote(symbol: string) {
  const p = (yahooFinance as any).quote(symbol, qOpts(), MODULE_OPTS) as Promise<any>;
  return withTimeout(p, YF_TIMEOUT_MS, `quote(${symbol})`);
}

export async function yfQuoteSummary(symbol: string, modules: readonly string[] | 'all') {
  const p = (yahooFinance as any).quoteSummary(
    symbol,
    { modules: modules as any, ...qOpts() },
    MODULE_OPTS
  ) as Promise<any>;
  return withTimeout(p, YF_TIMEOUT_MS, `quoteSummary(${symbol})`);
}

export async function yfChart(symbol: string, opts: any) {
  const p = (yahooFinance as any).chart(symbol, { ...opts, ...qOpts() }, MODULE_OPTS) as Promise<any>;
  return withTimeout(p, YF_TIMEOUT_MS, `chart(${symbol})`);
}

export async function yfScreener(scrId: string, count = 200) {
  const p = (yahooFinance as any).screener(
    { scrIds: scrId, count, ...qOpts() },
    MODULE_OPTS
  ) as Promise<any>;
  return withTimeout(p, YF_TIMEOUT_MS, `screener(${scrId})`);
}
