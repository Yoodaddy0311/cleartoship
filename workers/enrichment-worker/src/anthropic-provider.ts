import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
  EnrichmentLlmRequest,
  EnrichmentLlmResponse,
  LlmProvider,
} from './types.js';

/**
 * Anthropic-backed {@link LlmProvider} for the enrichment job. Calls the
 * Messages API with prompt caching on the (static) skill body so re-runs only
 * pay for the variable audit context, per the `claude-api` skill guidance.
 *
 * The SDK type is kept out of the public {@link LlmProvider} contract so the
 * orchestrator + its tests compile without the dependency. Tests here inject a
 * fake client (DI) or exercise the pure {@link parseJudgeResponse} helper — no
 * real network calls.
 */

/** Default model when `ENRICHMENT_MODEL` is unset. */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Terse output contract appended after the cached skill body. The model must
 * return ONLY the JSON object — `scoreL` is `null` when the category is
 * genuinely not measurable (e.g. no PRD, unreadable README) so the orchestrator
 * keeps the category N/A rather than persisting a fabricated number.
 */
const OUTPUT_INSTRUCTION =
  'Return ONLY a single JSON object, no prose and no markdown fences, with exactly these keys: ' +
  '{ "scoreL": number|null, "narrative": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "sources": string[] }. ' +
  'Set "scoreL" to null when the category is genuinely not measurable from the supplied context.';

/** Zod schema for the model's JSON payload (tokensUsed comes from usage, not the body). */
const JudgePayloadSchema = z.object({
  scoreL: z.number().min(0).max(100).nullable(),
  narrative: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  sources: z.array(z.string()),
});

export type JudgePayload = z.infer<typeof JudgePayloadSchema>;

/**
 * Strip an optional ```json … ``` (or bare ```) fence, then extract the first
 * balanced-looking `{ … }` block. Returns the trimmed candidate for JSON.parse.
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
 * Pure: parse + zod-validate the model's text response into a {@link JudgePayload}.
 * Throws on non-JSON, malformed, or schema-invalid input (the orchestrator
 * catches per-category so one bad response never aborts the others).
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

/**
 * Minimal structural subset of the Anthropic client this provider depends on —
 * enables deterministic dependency injection in tests without the SDK's full
 * surface or any network access.
 */
export interface AnthropicLike {
  beta: {
    promptCaching: {
      messages: {
        create(params: Anthropic.Beta.PromptCaching.MessageCreateParamsNonStreaming): Promise<
          Anthropic.Beta.PromptCaching.PromptCachingBetaMessage
        >;
      };
    };
  };
}

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  /** Override model; defaults to `ENRICHMENT_MODEL` env or {@link DEFAULT_MODEL}. */
  readonly model?: string;
  /** Injected client for tests (DI). Defaults to a real SDK instance. */
  readonly client?: AnthropicLike;
}

export class AnthropicProvider implements LlmProvider {
  private readonly client: AnthropicLike;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model ?? process.env.ENRICHMENT_MODEL ?? DEFAULT_MODEL;
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  }

  async judge(req: EnrichmentLlmRequest): Promise<EnrichmentLlmResponse> {
    const message = await this.client.beta.promptCaching.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: [
        // Block 1: static skill body — cached so re-runs skip re-billing it.
        { type: 'text', text: req.skillBody, cache_control: { type: 'ephemeral' } },
        // Block 2: variable output contract (kept uncached).
        { type: 'text', text: OUTPUT_INSTRUCTION },
      ],
      messages: [{ role: 'user', content: req.context }],
    });

    const payload = parseJudgeResponse(extractMessageText(message));
    const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;

    return {
      scoreL: payload.scoreL,
      narrative: payload.narrative,
      confidence: payload.confidence,
      sources: payload.sources,
      tokensUsed,
    };
  }
}

/** Concatenate all `text` content blocks of a Messages API response. */
function extractMessageText(
  message: Anthropic.Beta.PromptCaching.PromptCachingBetaMessage,
): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
