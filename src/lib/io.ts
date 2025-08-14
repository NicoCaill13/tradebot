import { promises as fs } from 'fs';
import path from 'path';
import { OUT_DIR } from '../settings.js';

export async function writePlan(filename: string, content: string) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, filename);
  await fs.writeFile(p, content, 'utf8');
  return p;
}
