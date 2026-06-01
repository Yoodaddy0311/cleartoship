import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPathAliases } from './load-path-aliases.js';

describe('loadPathAliases', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aliases-'));
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('reads compilerOptions.paths + baseUrl from tsconfig.json', async () => {
    await fsp.writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['./src/*'], '~/*': ['./*'] },
        },
      }),
      'utf8',
    );
    const aliases = await loadPathAliases(dir);
    expect(aliases.baseUrl).toBe('.');
    expect(aliases.paths['@/*']).toEqual(['./src/*']);
    expect(aliases.paths['~/*']).toEqual(['./*']);
  });

  it('tolerates // comments and trailing commas (tsconfig is JSONC)', async () => {
    await fsp.writeFile(
      path.join(dir, 'tsconfig.json'),
      `{
        // app paths
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"], // alias comment
          },
        },
      }`,
      'utf8',
    );
    const aliases = await loadPathAliases(dir);
    expect(aliases.paths['@/*']).toEqual(['./src/*']);
  });

  it('falls back to jsconfig.json when no tsconfig.json exists', async () => {
    await fsp.writeFile(
      path.join(dir, 'jsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./app/*'] } } }),
      'utf8',
    );
    const aliases = await loadPathAliases(dir);
    expect(aliases.paths['@/*']).toEqual(['./app/*']);
  });

  it('returns a sensible default (@/* → src) when no config exists', async () => {
    const aliases = await loadPathAliases(dir);
    expect(aliases.paths['@/*']).toBeDefined();
    expect(aliases.isDefault).toBe(true);
  });

  it('returns the default when the config is unparseable', async () => {
    await fsp.writeFile(path.join(dir, 'tsconfig.json'), '{ this is not json', 'utf8');
    const aliases = await loadPathAliases(dir);
    expect(aliases.isDefault).toBe(true);
  });
});
