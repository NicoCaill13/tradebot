export function ema(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2/(period+1); const out:number[]=[]; let e = values[0];
    for (let i=0;i<values.length;i++){ e = i===0 ? values[0] : values[i]*k + e*(1-k); out.push(e); }
    return out;
  }
  export function atr(highs: number[], lows: number[], closes: number[], period=14): number[] {
    const n = Math.min(highs.length, lows.length, closes.length);
    const tr:number[] = []; for (let i=0;i<n;i++){
      const hi = highs[i], lo = lows[i], prevClose = i? closes[i-1] : closes[0];
      tr.push(Math.max(hi-lo, Math.abs(hi-prevClose), Math.abs(lo-prevClose)));
    }
    return ema(tr, period);
  }
  export function vwap(close: number[], volume: number[]): number[] {
    let cumPV = 0, cumV = 0; const out:number[]=[];
    for (let i=0;i<close.length;i++){ const v = Math.max(0, volume[i]||0); cumPV += (close[i]*v); cumV += v; out.push(cumV ? (cumPV/cumV) : close[i]); }
    return out;
  }
  export function rvol(volume: number[], lookback=20): number[] {
    const out:number[]=[]; for (let i=0;i<volume.length;i++){
      const a = Math.max(0, i-lookback+1); const window = volume.slice(a, i+1);
      const avg = window.reduce((s,x)=>s+x,0)/window.length || 0; out.push(avg? (volume[i]/avg):1);
    } return out;
  }
  