import { describe, it, expect } from 'vitest';
import {
  GeminiProvider,
  parseJudgeResponse,
  type GenAiLike,
  type GenAiResponseLike,
} from './gemini-provider.js';

function fakeClient(response: GenAiResponseLike): GenAiLike {
  return {
    models: {
      async generateContent() {
        return response;
      },
    },
  };
}

const REQ = {
  category: 'PRODUCT_INTENT' as const,
  skillBody: 'SKILL',
  context: 'CTX',
  maxTokens: 5000,
};

describe('parseJudgeResponse', () => {
  it('parses clean JSON', () => {
    const p = parseJudgeResponse(
      '{"scoreL":75,"narrative":"ok","confidence":"MEDIUM","sources":["README.md"]}',
    );
    expect(p.scoreL).toBe(75);
    expect(p.confidence).toBe('MEDIUM');
    expect(p.sources).toEqual(['README.md']);
  });

  it('accepts a null scoreL (not measurable)', () => {
    expect(
      parseJudgeResponse('{"scoreL":null,"narrative":"n/a","confidence":"LOW","sources":[]}').scoreL,
    ).toBeNull();
  });

  it('defensively strips a ```json fence', () => {
    const p = parseJudgeResponse(
      '```json\n{"scoreL":60,"narrative":"x","confidence":"HIGH","sources":[]}\n```',
    );
    expect(p.scoreL).toBe(60);
  });

  it('throws on an invalid confidence value', () => {
    expect(() =>
      parseJudgeResponse('{"scoreL":50,"narrative":"x","confidence":"MAYBE","sources":[]}'),
    ).toThrow();
  });

  it('throws on an out-of-range scoreL', () => {
    expect(() =>
      parseJudgeResponse('{"scoreL":150,"narrative":"x","confidence":"HIGH","sources":[]}'),
    ).toThrow();
  });

  it('throws on non-JSON', () => {
    expect(() => parseJudgeResponse('not json at all')).toThrow();
  });
});

describe('GeminiProvider.judge (DI)', () => {
  const okResp: GenAiResponseLike = {
    text: '{"scoreL":72,"narrative":"의도 명확","confidence":"MEDIUM","sources":["README.md"]}',
    usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200, totalTokenCount: 1000 },
  };

  it('maps a structured response to EnrichmentLlmResponse', async () => {
    const p = new GeminiProvider({ apiKey: 'k', client: fakeClient(okResp) });
    const r = await p.judge(REQ);
    expect(r.scoreL).toBe(72);
    expect(r.confidence).toBe('MEDIUM');
    expect(r.sources).toEqual(['README.md']);
    expect(r.tokensUsed).toBe(1000);
  });

  it('sums prompt + candidate tokens when totalTokenCount is absent', async () => {
    const p = new GeminiProvider({
      apiKey: 'k',
      client: fakeClient({
        text: okResp.text,
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 },
      }),
    });
    expect((await p.judge(REQ)).tokensUsed).toBe(1000);
  });

  it('throws on an empty response (orchestrator catches per category)', async () => {
    const p = new GeminiProvider({ apiKey: 'k', client: fakeClient({ text: '' }) });
    await expect(p.judge(REQ)).rejects.toThrow();
  });

  it('uses ENRICHMENT_MODEL as the model when set', async () => {
    const prev = process.env.ENRICHMENT_MODEL;
    process.env.ENRICHMENT_MODEL = 'gemini-test-model';
    let usedModel = '';
    const client: GenAiLike = {
      models: {
        async generateContent(params) {
          usedModel = params.model;
          return okResp;
        },
      },
    };
    try {
      await new GeminiProvider({ apiKey: 'k', client }).judge(REQ);
      expect(usedModel).toBe('gemini-test-model');
    } finally {
      if (prev === undefined) delete process.env.ENRICHMENT_MODEL;
      else process.env.ENRICHMENT_MODEL = prev;
    }
  });
});
