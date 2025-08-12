import dayjs from 'dayjs';

export const fmtUSD = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const pctStr = (n: number) => `${(n * 100).toFixed(1)}%`;

export function withinPreEventWindow(eventDate: string | null, minDays: number, maxDays: number): boolean {
  if (!eventDate) return false;
  const d = dayjs(eventDate);
  const daysToEvent = d.diff(dayjs(), 'day');
  return daysToEvent <= maxDays && daysToEvent >= minDays;
}