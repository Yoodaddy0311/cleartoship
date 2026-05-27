import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  EnrichmentLlmRequest,
  EnrichmentLlmResponse,
  LlmProvider,
} from './types.js';

/**
 * Gemini-backed {@link LlmProvider} for the enrichment job.
 *
 * Uses the unified Google Gen AI SDK (`@google/genai`) against the Gemini
 * Developer API (AI Studio) with a `GEMINI_API_KEY`. ClearToShip provisions a
 * Gemini key (not Anthropic), so this is the production provider.
 *
 * Gemini's native structured output (`responseMimeType: 'application/json'` +
 * `responseSchema`) makes the model return clean JSON matching the contract,
 * so there is no fence-stripping; we still zod-validate as defence in depth.
 * The SDK type is kept out of the public {@link LlmProvider} contract so the
 * orchestrator + its tests compile without the dependency. Tests inject a fake
 * client (DI) or exercise the pure {@link parseJudgeResponse} helper.
 */

/** Default model — Gemini 3.5 Flash (GA): frontier value, fast, low cost. */
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Appended to the skill body so the model knows the exact output contract. */
const OUTPUT_INSTRUCTION =
  '\n\n---\nReturn ONLY a JSON object with exactly these keys: ' +
  '{ "scoreL": number|null, "narrative": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "sources": string[] }. ' +
  'Set "scoreL" to null when the category is genuinely not measurable from the supplied context.';

/** Gemini responseSchema enforcing the judge payload shape. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scoreL: { type: Type.NUMBER, nullable: true },
    narrative: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ['HIGH', 'MEDIUM', 'LOW'] },
    sources: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['scoreL', 'narrative', 'confidence', 'sources'],
} as const;

/** Zod schema for the model's JSON payload (tokens come from usage, not body). */
const JudgePayloadSchema = z.object({
  scoreL: z.number().min(0).max(100).nullable(),
  narrative: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  sources: z.array(z.string()),
});

export type JudgePayload = z.infer<typeof JudgePayloadSchema>;

/**
 * Strip an optional ```json … ``` fence then extract the first `{ … }` block —
 * defensive; `responseMimeType: 'application/json'` should already return bare
 * JSON. Returns the candidate for JSON.parse.
 */
function extractJsonText(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence?.[1] !== undefined) text = fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) text = text.slice(first, last + 1);
  return text;
}

/**
 * Pure: parse + zod-validate the model's text into a {@link JudgePayload}.
 * Throws on non-JSON / schema-invalid input (the orchestrator catches per
 * category so one bad response never aborts the others).
 */
export function parseJudgeResponse(text: string): JudgePayload {
  const candidate = extractJsonText(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `enrichment judge response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return JudgePayloadSchema.parse(parsed);
}

/** Minimal generateContent response shape this provider reads. */
export interface GenAiResponseLike {
  readonly text?: string;
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

/**
 * Minimal structural subset of the `@google/genai` client this provider needs
 * — enables deterministic DI in tests without the SDK or any network access.
 */
export interface GenAiLike {
  readonly models: {
    generateContent(params: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }): Promise<GenAiResponseLike>;
  };
}

export interface GeminiProviderOptions {
  readonly apiKey: string;
  /** Override model; defaults to `ENRICHMENT_MODEL` env or {@link DEFAULT_MODEL}. */
  readonly model?: string;
  /** Injected client for tests (DI). Defaults to a real SDK instance. */
  readonly client?: GenAiLike;
}

/** Total tokens for a response, preferring totalTokenCount, else the sum. */
function tokensOf(usage: GenAiResponseLike['usageMetadata']): number {
  if (!usage) return 0;
  if (typeof usage.totalTokenCount === 'number') return usage.totalTokenCount;
  return (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0);
}

export class GeminiProvider implements LlmProvider {
  private readonly client: GenAiLike;
  private readonly model: string;

  constructor(opts: GeminiProviderOptions) {
    this.model = opts.model ?? process.env.ENRICHMENT_MODEL ?? DEFAULT_MODEL;
    this.client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async judge(req: EnrichmentLlmRequest): Promise<EnrichmentLlmResponse> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: req.context,
      config: {
        systemInstruction: req.skillBody + OUTPUT_INSTRUCTION,
        maxOutputTokens: req.maxTokens,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
    const text = response.text;
    if (!text || text.trim().length === 0) {
      throw new Error('enrichment judge returned an empty response');
    }
    const payload = parseJudgeResponse(text);
    return {
      scoreL: payload.scoreL,
      narrative: payload.narrative,
      confidence: payload.confidence,
      sources: payload.sources,
      tokensUsed: tokensOf(response.usageMetadata),
    };
  }
}
