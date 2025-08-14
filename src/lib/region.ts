// src/lib/regions.ts
import { Region } from '../types.js';

// Suffixes européens "propres" (.PA, .DE, .L, ...)
const EU_SUFFIXES = new Set([
  'PA', 'AS', 'BR', 'LS', 'MI', 'MC', 'DE', 'L', 'SW', 'CO', 'ST', 'HE', 'OL',
]);

// Codes d'exchanges US (champ q.exchange chez Yahoo)
const US_EXCH_CODES = new Set([
  'NMS', // Nasdaq Global Select
  'NGM', // Nasdaq Global Market
  'NCM', // Nasdaq Capital Market
  'NYQ', // NYSE
  'ASE', // NYSE American
  'ARC', // NYSE Arca
  'BATS',
  'PNK', 'OB', 'OTC', // OTC markets
]);

// Noms d'exchanges US fréquents (fullExchangeName)
const US_EXCH_NAMES: RegExp[] = [
  /Nasdaq/i, /NasdaqGS/i, /NasdaqGM/i, /NasdaqCM/i,
  /\bNYSE\b/i, /NYSE American/i, /NYSEArca/i,
  /AMEX/i, /\bBATS\b/i, /Cboe/i, /\bOTC\b/i,
];

// Noms d'exchanges EU fréquents (fullExchangeName)
const EU_EXCH_NAMES: RegExp[] = [
  // Euronext
  /Euronext/i, /Paris/i, /Amsterdam/i, /Brussels/i, /Lisbon/i, /Milan/i,
  // Allemagne
  /XETRA/i, /Frankfurt/i, /Deutsche Börse/i,
  // UK / Irlande
  /\bLSE\b/i, /London Stock Exchange/i,
  // Nordiques
  /Nasdaq Stockholm/i, /Stockholm/i,
  /Nasdaq Copenhagen/i, /Copenhagen/i,
  /Nasdaq Helsinki/i, /Helsinki/i,
  /Oslo Børs?/i, /Oslo/i,
  // Suisse
  /SIX Swiss/i, /Zurich/i,
  // Espagne / Italie
  /Bolsa de Madrid/i, /Madrid/i, /BME/i,
  /Borsa Italiana/i, /\bMTA\b/i,
  // Divers
  /Vienna/i, /Athens/i, /Luxembourg/i,
];

function tickerSuffix(sym: string): string | null {
  const i = sym.lastIndexOf('.');
  return i >= 0 ? sym.slice(i + 1).toUpperCase() : null;
}

export function isUSExchange(exchName: string, exchCode?: string): boolean {
  if (exchCode && US_EXCH_CODES.has(exchCode.toUpperCase())) return true;
  return US_EXCH_NAMES.some((rx) => rx.test(exchName));
}

export function isEUExchange(symbol: string, exchName: string): boolean {
  const suf = tickerSuffix(symbol);
  if (suf && EU_SUFFIXES.has(suf)) return true;     // .PA, .DE, .L, ...
  return EU_EXCH_NAMES.some((rx) => rx.test(exchName));
}

// REGION=ALL => US ∪ EU
export function isExchangeOk(
  region: Region,
  symbol: string,
  exchName: string,
  exchCode?: string,
): boolean {
  const us = isUSExchange(exchName, exchCode);
  const eu = isEUExchange(symbol, exchName);

  if (region === Region.US) return us;
  if (region === Region.EU) return eu;
  return us || eu; // Region.ALL
}
