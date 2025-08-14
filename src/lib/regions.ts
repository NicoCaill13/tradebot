import { Region } from '../types.js';

const EU_SUFFIX = new Set(['PA','AS','BR','LS','MI','MC','DE','L','SW','CO','ST','HE','OL']);
const US_CODES = new Set(['NMS','NGM','NCM','NYQ','ASE','ARC','BATS','PNK','OB','OTC']);
const US_NAMES: RegExp[] = [/Nasdaq/i, /NYSE\b/i, /NYSE American/i, /NYSEArca/i, /\bBATS\b/i, /Cboe/i, /\bOTC\b/i];
const EU_NAMES: RegExp[] = [/Euronext/i, /Paris/i, /Amsterdam/i, /Brussels/i, /Lisbon/i, /Milan/i, /XETRA/i, /Frankfurt/i, /\bLSE\b/i, /London Stock Exchange/i, /SIX Swiss/i, /Zurich/i, /Nasdaq Stockholm/i, /Copenhagen/i, /Helsinki/i, /Oslo/i, /Bolsa de Madrid/i, /Madrid/i, /BME/i];

function suffix(sym: string){ const i = sym.lastIndexOf('.'); return i>=0 ? sym.slice(i+1).toUpperCase() : null; }

export function isUS(exchName: string, exchCode?: string): boolean {
  if (exchCode && US_CODES.has(exchCode.toUpperCase())) return true;
  return US_NAMES.some(rx => rx.test(exchName));
}
export function isEU(symbol: string, exchName: string): boolean {
  const suf = suffix(symbol); if (suf && EU_SUFFIX.has(suf)) return true;
  return EU_NAMES.some(rx => rx.test(exchName));
}
export function matchRegion(region: Region, symbol: string, exchName: string, exchCode?: string): boolean {
  const us = isUS(exchName, exchCode);
  const eu = isEU(symbol, exchName);
  if (region === Region.US) return us;
  if (region === Region.EU) return eu;
  return us || eu; // ALL
}
