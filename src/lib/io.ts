// src/lib/io.ts
// IO helpers (watchlist, output paths etc.)
import { promises as fs } from 'fs';
import path from 'path';

export async function loadWatchlist(file = 'watchlist.txt'): Promise<string[]> {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const raw = await fs.readFile(full, 'utf8').catch(() => '');
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && !s.startsWith('#'));
}
