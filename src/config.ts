import { z } from 'zod';

const PreEventTrimSchema = z.object({
  eventDate: z.string().nullable(), // YYYY-MM-DD | null
  windowDaysMin: z.number().min(0).default(3),
  windowDaysMax: z.number().min(0).default(10),
  trimPctOfPosition: z.number().min(0).max(1).default(0.4),
  holdThroughEventPct: z.number().min(0).max(1).default(0.6),
});

export const PositionCfgSchema = z.object({
  ticker: z.string(),
  targetWeight: z.number().min(0).max(1),
  entry: z.object({
    tranches: z.array(z.number().min(0).max(1)).nonempty(), // e.g. [0.5, 0.5]
    buyDipPercents: z.array(z.number()).nonempty(),          // e.g. [0, -3]
  }),
  stops: z.object({
    trailingPct: z.number().min(0.01).max(0.8),
    hardStopPct: z.number().min(0.01).max(0.9).optional(),
  }),
  spikeRule: z.object({
    pctUpDay: z.number().min(0.01).max(1),
    newTrailingPct: z.number().min(0.01).max(0.8),
  }).optional(),
  preEventTrim: PreEventTrimSchema.optional(),
  takeProfitLevels: z.array(z.number().min(0.01).max(5)).optional(),
  notes: z.string().optional(),
});

export const ConfigSchema = z.object({
  paperTrade: z.boolean().default(true),
  assumeFills: z.boolean().default(false),
  capital: z.number().positive(),
  maxPortfolioDrawdownPct: z.number().min(0).max(1).default(0.2),
  positions: z.array(PositionCfgSchema).nonempty(),
}).refine(cfg => Math.abs(cfg.positions.reduce((s, p) => s + p.targetWeight, 0) - 1) < 1e-6,
  { message: 'Sum of targetWeight must equal 1.0' }
);

export type PositionCfg = z.infer<typeof PositionCfgSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// Default CONFIG aligned with our plan
export const CONFIG: Config = ConfigSchema.parse({
  paperTrade: true,
  assumeFills: false,
  capital: 100000,
  maxPortfolioDrawdownPct: 0.2,
  positions: [
    {
      ticker: 'OMER',
      targetWeight: 0.35,
      entry: { tranches: [0.5, 0.5], buyDipPercents: [0, -3] },
      stops: { trailingPct: 0.20 },
      spikeRule: { pctUpDay: 0.15, newTrailingPct: 0.12 },
      preEventTrim: {
        eventDate: '2025-09-25',
        windowDaysMin: 3,
        windowDaysMax: 10,
        trimPctOfPosition: 0.4,
        holdThroughEventPct: 0.6,
      },
      notes: 'FDA PDUFA for narsoplimab (TA-TMA).',
    },
    {
      ticker: 'MREO',
      targetWeight: 0.25,
      entry: { tranches: [0.5, 0.5], buyDipPercents: [0, -3] },
      stops: { trailingPct: 0.15 },
      takeProfitLevels: [0.35, 0.6],
      preEventTrim: { eventDate: null, windowDaysMin: 3, windowDaysMax: 10, trimPctOfPosition: 0.5, holdThroughEventPct: 0.5 },
      notes: 'ORBIT Phase 3 final analysis expected Q4 2025.',
    },
    {
      ticker: 'VTGN',
      targetWeight: 0.25,
      entry: { tranches: [0.34, 0.33, 0.33], buyDipPercents: [0, -3, -6] },
      stops: { trailingPct: 0.20 },
      takeProfitLevels: [0.4, 0.75],
      preEventTrim: { eventDate: null, windowDaysMin: 3, windowDaysMax: 10, trimPctOfPosition: 0.5, holdThroughEventPct: 0.5 },
      notes: 'Fasedienol in SAD; Phase 3 topline Q4 2025.',
    },
    {
      ticker: 'ANIX',
      targetWeight: 0.15,
      entry: { tranches: [0.5, 0.5], buyDipPercents: [0, -3] },
      stops: { trailingPct: 0.20 },
      takeProfitLevels: [0.3, 0.5],
      preEventTrim: { eventDate: null, windowDaysMin: 3, windowDaysMax: 10, trimPctOfPosition: 0.5, holdThroughEventPct: 0.5 },
      notes: 'Conference run-up likely Dec 2025.',
    },
  ],
});
