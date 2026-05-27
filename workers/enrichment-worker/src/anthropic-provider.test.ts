import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider, parseJudgeResponse, type AnthropicLike } from './anthropic-provider.js';
import type { EnrichmentLlmRequest } from './types.js';

const CLEAN = JSON.stringify({
  scoreL: 80,
  narrative: '의도가 명확하다',
  confidence: 'HIGH',
  sources: ['README.md'],
});

describe('parseJudgeResponse', () => {
  it('parses a clean JSON object', () => {
    const out = parseJudgeResponse(CLEAN);
    expect(out).toEqual({
      scoreL: 80,
      narrative: '의도가 명확하다',
      confidence: 'HIGH',
      sources: ['README.md'],
    });
  });

  it('strips a ```json fence before parsing', () => {
    const fenced = '```json\n' + CLEAN + '\n```';
    expect(parseJudgeResponse(fenced).scoreL).toBe(80);
  });

  it('strips a bare ``` fence before parsing', () => {
    const fenced = '```\n' + CLEAN + '\n```';
    expect(parseJudgeResponse(fenced).confidence).toBe('HIGH');
  });

  it('extracts the JSON object when wrapped in prose', () => {
    const noisy = `Here is my judgment:\n${CLEAN}\nThanks!`;
    expect(parseJudgeResponse(noisy).sources).toEqual(['README.md']);
  });

  it('accepts a null scoreL (category not measurable)', () => {
    const body = JSON.stringify({ scoreL: null, narrative: 'n/a', confidence: 'LOW', sources: [] });
    expect(parseJudgeResponse(body).scoreL).toBeNull();
  });

  it('throws on an invalid confidence value', () => {
    const body = JSON.stringify({ scoreL: 50, narrative: 'x', confidence: 'MAYBE', sources: [] });
    expect(() => parseJudgeResponse(body)).toThrow();
  });

  it('throws on an out-of-range scoreL', () => {
    const body = JSON.stringify({ scoreL: 140, narrative: 'x', confidence: 'HIGH', sources: [] });
    expect(() => parseJudgeResponse(body)).toThrow();
  });

  it('throws on non-JSON text', () => {
    expect(() => parseJudgeResponse('I cannot answer that.')).toThrow(/not valid JSON/);
  });
});

/** Build a fake Anthropic client returning a canned message + usage. */
function fakeClient(
  text: string,
  usage: { input_tokens: number; output_tokens: number },
  capture?: (params: unknown) => void,
): AnthropicLike {
  return {
    beta: {
      promptCaching: {
        messages: {
          create: vi.fn(async (params: unknown) => {
            capture?.(params);
            return {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              model: 'claude-sonnet-4-6',
              stop_reason: 'end_turn',
              stop_sequence: null,
              content: [{ type: 'text', text }],
              usage: {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_creation_input_tokens: null,
                cache_read_input_tokens: null,
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
          }),
        },
      },
    },
  };
}

const req: EnrichmentLlmRequest = {
  category: 'PRODUCT_INTENT',
  skillBody: 'SKILL BODY',
  context: 'AUDIT CONTEXT',
  maxTokens: 5000,
};

describe('AnthropicProvider.judge', () => {
  it('maps a clean response and sums input+output tokens', async () => {
    const client = fakeClient(CLEAN, { input_tokens: 1200, output_tokens: 300 });
    const provider = new AnthropicProvider({ apiKey: 'unused', client });
    const res = await provider.judge(req);
    expect(res).toEqual({
      scoreL: 80,
      narrative: '의도가 명확하다',
      confidence: 'HIGH',
      sources: ['README.md'],
      tokensUsed: 1500,
    });
  });

  it('sends a 2-block system prompt with cache_control on the skill body', async () => {
    let captured: unknown;
    const client = fakeClient(CLEAN, { input_tokens: 10, output_tokens: 10 }, (p) => {
      captured = p;
    });
    const provider = new AnthropicProvider({ apiKey: 'unused', model: 'm', client });
    await provider.judge(req);
    const params = captured as {
      model: string;
      max_tokens: number;
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(params.model).toBe('m');
    expect(params.max_tokens).toBe(5000);
    expect(params.system).toHaveLength(2);
    expect(params.system[0]).toMatchObject({ text: 'SKILL BODY', cache_control: { type: 'ephemeral' } });
    expect(params.system[1]?.cache_control).toBeUndefined();
    expect(params.messages).toEqual([{ role: 'user', content: 'AUDIT CONTEXT' }]);
  });

  it('parses a fenced response from the model', async () => {
    const client = fakeClient('```json\n' + CLEAN + '\n```', { input_tokens: 5, output_tokens: 5 });
    const provider = new AnthropicProvider({ apiKey: 'unused', client });
    expect((await provider.judge(req)).scoreL).toBe(80);
  });

  it('propagates a null scoreL', async () => {
    const body = JSON.stringify({ scoreL: null, narrative: 'n/a', confidence: 'LOW', sources: [] });
    const client = fakeClient(body, { input_tokens: 5, output_tokens: 5 });
    const provider = new AnthropicProvider({ apiKey: 'unused', client });
    expect((await provider.judge(req)).scoreL).toBeNull();
  });

  it('throws when the model returns non-JSON', async () => {
    const client = fakeClient('no json here', { input_tokens: 5, output_tokens: 5 });
    const provider = new AnthropicProvider({ apiKey: 'unused', client });
    await expect(provider.judge(req)).rejects.toThrow();
  });

  it('defaults the model from ENRICHMENT_MODEL when not overridden', async () => {
    const prev = process.env.ENRICHMENT_MODEL;
    process.env.ENRICHMENT_MODEL = 'env-model';
    let captured: unknown;
    const client = fakeClient(CLEAN, { input_tokens: 1, output_tokens: 1 }, (p) => {
      captured = p;
    });
    try {
      const provider = new AnthropicProvider({ apiKey: 'unused', client });
      await provider.judge(req);
      expect((captured as { model: string }).model).toBe('env-model');
    } finally {
      if (prev === undefined) delete process.env.ENRICHMENT_MODEL;
      else process.env.ENRICHMENT_MODEL = prev;
    }
  });
});
