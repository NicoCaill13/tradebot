  export function vwap(close: number[], volume: number[]): number[] {
    let cumPV = 0, cumV = 0; const out:number[]=[];
    for (let i=0;i<close.length;i++){ const v = Math.max(0, volume[i]||0); cumPV += (close[i]*v); cumV += v; out.push(cumV ? (cumPV/cumV) : close[i]); }
    return out;
  }

export function sma(arr: number[], n: number): number[] {
  const out = new Array<number>(arr.length).fill(NaN);
  let sum = 0;
  for (let i=0;i<arr.length;i++){
    sum += arr[i];
    if (i>=n) sum -= arr[i-n];
    if (i>=n-1) out[i] = sum/n;
  }
  return out;
}
export function ema(arr: number[], n: number): number[] {
  const out = new Array<number>(arr.length).fill(NaN);
  if (!arr.length) return out;
  const k = 2/(n+1);
  let prev = arr[0];
  out[0] = prev;
  for (let i=1;i<arr.length;i++){
    prev = arr[i]*k + prev*(1-k);
    out[i] = prev;
  }
  return out;
}
export function atr(highs: number[], lows: number[], closes: number[], n: number): number[] {
  const tr: number[] = [];
  for (let i=0;i<closes.length;i++){
    const h = highs[i], l = lows[i];
    const pc = i>0 ? closes[i-1] : closes[i];
    tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  return sma(tr, n);
}
export function bollinger(closes: number[], period: number, stdMult: number) {
  const mid = sma(closes, period);
  const up: number[] = new Array(closes.length).fill(NaN);
  const lo: number[] = new Array(closes.length).fill(NaN);
  for (let i=0;i<closes.length;i++){
    if (i < period-1) continue;
    let s=0; const from = i - period + 1;
    for (let j=from;j<=i;j++) s += Math.pow(closes[j] - mid[i], 2);
    const stdev = Math.sqrt(s / period);
    up[i] = mid[i] + stdMult*stdev;
    lo[i] = mid[i] - stdMult*stdev;
  }
  return { mid, up, lo };
}
export function rvol(vols: number[], n: number): number[] {
  const out = new Array<number>(vols.length).fill(NaN);
  const ma = sma(vols, n);
  for (let i=0;i<vols.length;i++){
    const m = ma[i]; out[i] = m && m>0 ? vols[i]/m : NaN;
  }
  return out;
}

// --- RSI (Wilder) ---
export function rsi(closes: number[], period = 14): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + (avgGain / avgLoss));

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + (avgGain / avgLoss));
  }
  return out;
}
