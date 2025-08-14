import dayjs from 'dayjs';
import YahooFinance from 'yahoo-finance2';


export const yahoo = new (YahooFinance as any)();
export const NO_VALIDATE = { validateResult: false } as const;

export async function safeTrending(region: string) {
    const tr: any = await (yahoo as any)
      .trendingSymbols(region, undefined, NO_VALIDATE)
      .catch(() => null);
    return (tr?.quotes || tr?.symbols || tr || []) as any[];
}

export  async function safeScreener(scrId: string, count = 150) {
    const res: any = await (yahoo as any)
      .screener({ scrIds: scrId, count }, undefined, NO_VALIDATE)
      .catch(() => null);
    return (res?.finance?.result?.[0]?.quotes || res?.quotes || []) as any[];
}

export const fmtUSD = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const pctStr = (n: number) => `${(n * 100).toFixed(1)}%`;

export function withinPreEventWindow(eventDate: string | null, minDays: number, maxDays: number): boolean {
  if (!eventDate) return false;
  const d = dayjs(eventDate);
  const daysToEvent = d.diff(dayjs(), 'day');
  return daysToEvent <= maxDays && daysToEvent >= minDays;
}