// src/lib/aiReview.ts
import OpenAI from 'openai';
import { ReviewDecision, ReviewCandidate } from '../types';
// JSON Schema pour forcer un retour structuré
const schema = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          allow: { type: "boolean" },
          rank: { type: "integer", minimum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reasons: { type: "array", items: { type: "string" } },
          adjust: {
            type: "object",
            properties: {
              entry: { type: "number" },
              stop:  { type: "number" },
              tp1:   { type: "number" },
              tp2:   { type: "number" },
              shares:{ type: "integer", minimum: 1 }
            },
            additionalProperties: false
          }
        },
        required: ["ticker", "allow", "rank", "confidence", "reasons"],
        additionalProperties: false
      }
    }
  },
  required: ["decisions"],
  additionalProperties: false
} as const;

export async function reviewWithAI(cands: ReviewCandidate[]): Promise<ReviewDecision[]> {
  const enabled = (process.env.REVIEW_WITH_AI ?? 'false').toLowerCase() === 'true';
  if (!enabled) {
    return cands.map((c, i) => ({
      ticker: c.ticker, allow: true, rank: i + 1, confidence: 0.5, reasons: ["AI review disabled"]
    }));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return cands.map((c, i) => ({
      ticker: c.ticker, allow: true, rank: i + 1, confidence: 0.5, reasons: ["Missing OPENAI_API_KEY"]
    }));
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // modèle texte rapide
  const mode  = (process.env.AI_TARGET_MODE ?? 'STRICT').toUpperCase(); // STRICT | RELAX
  const maxBatch = Number(process.env.AI_MAX_BATCH ?? 20);
  const batch = cands.slice(0, Math.max(1, maxBatch));

  const sys = [
    "Tu es un validateur de plans de trading swing (horizon: d'aujourd'hui à vendredi).",
    "Règles :",
    "- On joue des micro-caps 1$–10$ ; le plan fourni contient ENTRY, STOP, TP1, TP2, SHARES.",
    "- Si AI_TARGET_MODE=STRICT : n'ajuste rien, juste allow/rank/reasons.",
    "- Si AI_TARGET_MODE=RELAX : tu peux ajuster légèrement ENTRY(+0..+0.3%), STOP(+0..+0.5%), TP1/TP2(±5%), SHARES(±15%).",
    "- Refuse si setup illiquide, trop étiré, ou R médiocre.",
    "- Renvoie uniquement via l'appel de fonction au format du schéma (pas de texte libre)."
  ].join('\n');

  const user = {
    mode,
    constraints: {
      horizon: "close vendredi",
      sizing: "risk-based déjà calculé",
      takeProfits: "1.5R / 3R",
    },
    candidates: batch
  };

  // Chat Completions + tools (function calling)
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(user) }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'return_decisions',
          description: 'Retourne la liste des décisions (triables par rank) pour les candidats fournis.',
          parameters: schema as any
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: 'return_decisions' } }
  });

  // --- Extraction robuste des arguments JSON ---
  const msg: any = completion.choices?.[0]?.message ?? {};
  const toolCall: any = (msg.tool_calls && msg.tool_calls[0]) ? msg.tool_calls[0] : null;
  const argsStr: string | undefined = toolCall?.function?.arguments;

  if (!argsStr) {
    // fallback : autoriser et classer dans l’ordre d’entrée
    return batch.map((c, i) => ({
      ticker: c.ticker, allow: true, rank: i + 1, confidence: 0.4, reasons: ["AI returned no tool call; allowed by fallback"]
    }));
  }

  let parsed: any;
  try {
    parsed = JSON.parse(argsStr);
  } catch {
    parsed = { decisions: [] };
  }

  if (!parsed?.decisions?.length) {
    return batch.map((c, i) => ({
      ticker: c.ticker, allow: true, rank: i + 1, confidence: 0.4, reasons: ["AI returned empty; allowed by fallback"]
    }));
  }

  const decisions: ReviewDecision[] = parsed.decisions
    .filter((d: any) => typeof d?.ticker === 'string')
    .sort((a: any, b: any) => (a.rank ?? 9999) - (b.rank ?? 9999));

  return decisions;
}