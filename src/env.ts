import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project root sits one level above /src
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const OUT_DIR = path.join(ROOT_DIR, 'out');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');

export const TODAY = dayjs().format('YYYY-MM-DD');
