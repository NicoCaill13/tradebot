// src/env.ts
import 'dotenv/config';
import dayjs from 'dayjs';
import path from 'path';
import { OUT_DIR_ENV } from './settings.js';

export const TODAY = dayjs().format('YYYY-MM-DD');

const DATA_DIR_ENV = process.env.DATA_DIR || 'data';

// Chemins absolus
export const OUT_DIR = path.join(process.cwd(), OUT_DIR_ENV);
export const DATA_DIR = path.join(process.cwd(), DATA_DIR_ENV);

// Fichier d'état
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
