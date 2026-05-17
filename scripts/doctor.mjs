#!/usr/bin/env node
// ClearToShip environment doctor — diagnose developer onboarding readiness.
// Usage: pnpm doctor

import { execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  pass: COLOR ? '\x1b[32mPASS\x1b[0m' : 'PASS',
  warn: COLOR ? '\x1b[33mWARN\x1b[0m' : 'WARN',
  fail: COLOR ? '\x1b[31mFAIL\x1b[0m' : 'FAIL',
  dim: (s) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
};

const results = [];
const record = (status, item, reason) => {
  results.push({ status, item, reason });
  const tag = c[status];
  console.log(`${tag} ${item.padEnd(34)} ${c.dim(reason)}`);
};

function which(cmd) {
  try {
    const out = execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return out || null;
  } catch {
    return null;
  }
}

function version(cmd, args = ['--version']) {
  try {
    return execSync(`${cmd} ${args.join(' ')}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
  } catch {
    return null;
  }
}

function portOpen(port, host = '127.0.0.1', timeout = 400) {
  return new Promise((res) => {
    const sock = createConnection({ port, host });
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      sock.destroy();
      res(open);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

function ageHours(path) {
  try {
    const ms = Date.now() - statSync(path).mtimeMs;
    return ms / 1000 / 3600;
  } catch {
    return null;
  }
}

console.log(c.bold('\nClearToShip Doctor\n'));

// 1. Node version
{
  const major = Number(process.versions.node.split('.')[0]);
  const v = `v${process.versions.node}`;
  if (major >= 20) record('pass', 'Node.js >= 20', v);
  else record('fail', 'Node.js >= 20', `${v} (engines.node >=20.0.0 required)`);
}

// 2. pnpm
{
  const v = version('pnpm');
  if (!v) record('fail', 'pnpm CLI', 'not found in PATH — install: npm i -g pnpm');
  else record('pass', 'pnpm CLI', v);
}

// 3. Firebase CLI
{
  const v = version('firebase');
  if (!v) record('fail', 'firebase CLI', 'not found — install: npm i -g firebase-tools');
  else record('pass', 'firebase CLI', v);
}

// 4. Java (firestore emulator dependency)
{
  let v = null;
  try {
    v = execSync('java -version 2>&1', { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .split(/\r?\n/)[0]
      .trim();
  } catch {}
  if (!v) record('warn', 'Java runtime', 'not found — firestore/storage emulator requires JRE >=11');
  else record('pass', 'Java runtime', v);
}

// 4b. Audit tools (worker pipeline dependencies)
{
  const isWin = process.platform === 'win32';
  const homeApp = process.env.APPDATA ?? '';
  const localApp = process.env.LOCALAPPDATA ?? '';
  const candidates = {
    semgrep: [
      isWin && homeApp ? `${homeApp}\\Python\\Python312\\Scripts\\semgrep.exe` : null,
    ].filter(Boolean),
    'osv-scanner': [
      isWin && localApp
        ? `${localApp}\\Microsoft\\WinGet\\Packages\\Google.OSVScanner_Microsoft.Winget.Source_8wekyb3d8bbwe\\osv-scanner.exe`
        : null,
    ].filter(Boolean),
  };
  for (const tool of ['semgrep', 'osv-scanner']) {
    let v = version(tool);
    let pathHint = '';
    if (!v) {
      for (const cand of candidates[tool]) {
        if (existsSync(cand)) {
          const candDir = cand.replace(/\\[^\\]+$/, '');
          try {
            v = execSync(`"${cand}" --version`, {
              env: { ...process.env, PATH: `${candDir};${process.env.PATH}` },
              stdio: ['ignore', 'pipe', 'ignore'],
            })
              .toString()
              .split(/\r?\n/)[0]
              .trim();
            pathHint = ` — installed but not on user PATH: ${candDir}`;
            break;
          } catch {}
        }
      }
    }
    if (!v) {
      const installCmd =
        tool === 'semgrep'
          ? 'pip install --user semgrep'
          : 'winget install Google.OSVScanner';
      record('warn', `audit tool: ${tool}`, `not installed — ${installCmd} (SKIP only)`);
    } else if (pathHint) {
      record('pass', `audit tool: ${tool}`, `${v}${pathHint} (dev:full auto-augments PATH)`);
    } else {
      record('pass', `audit tool: ${tool}`, v);
    }
  }
}

// 5. Emulator ports (must be FREE before `pnpm emulators`)
{
  const ports = [
    { p: 4000, name: 'ui' },
    { p: 5000, name: 'hosting' },
    { p: 5001, name: 'functions' },
    { p: 8080, name: 'firestore' },
    { p: 9099, name: 'auth' },
    { p: 9199, name: 'storage' },
  ];
  const checks = await Promise.all(ports.map((x) => portOpen(x.p).then((open) => ({ ...x, open }))));
  const busy = checks.filter((x) => x.open);
  if (busy.length === 0) {
    record('pass', 'Emulator ports free', '4000/5000/5001/8080/9099/9199');
  } else {
    const owners = new Map();
    if (process.platform === 'win32') {
      try {
        const ns = execSync('netstat -ano', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        for (const { p } of busy) {
          const re = new RegExp(`\\s127\\.0\\.0\\.1:${p}\\b.*LISTENING\\s+(\\d+)`);
          const m = ns.match(re);
          if (m) owners.set(p, m[1]);
        }
        const pids = [...new Set([...owners.values()])];
        if (pids.length) {
          const psOut = execSync(
            `powershell -NoProfile -Command "Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName | ConvertTo-Json -Compress"`,
            { stdio: ['ignore', 'pipe', 'ignore'] },
          )
            .toString()
            .trim();
          if (psOut) {
            const raw = JSON.parse(psOut);
            const list = Array.isArray(raw) ? raw : [raw];
            const nameByPid = new Map(list.map((x) => [String(x.Id), x.ProcessName]));
            for (const [port, pid] of owners) owners.set(port, `${pid}:${nameByPid.get(pid) ?? '?'}`);
          }
        }
      } catch {}
    }
    const desc = busy
      .map((x) => (owners.get(x.p) ? `${x.p}(${x.name},pid=${owners.get(x.p)})` : `${x.p}(${x.name})`))
      .join(', ');
    const ownerNames = [...owners.values()].map((v) => String(v).split(':')[1] ?? '');
    const looksLikeStaleEmu =
      ownerNames.length > 0 &&
      ownerNames.every((n) => ['node', 'java', 'java.exe', 'node.exe'].includes(n));
    const hint = looksLikeStaleEmu
      ? ' — looks like stale firebase emulator (node+java). Run: pnpm free-ports --kill (or Ctrl+C the old emulator)'
      : ' — run: pnpm free-ports  (lists owners; add --kill to stop them)';
    record('fail', 'Emulator ports free', `occupied: ${desc}${hint}`);
  }
}

// 6. .env files
{
  const envs = [
    { path: 'apps/web/.env.local', label: 'web .env.local' },
    { path: 'workers/audit-worker/.env', label: 'worker .env' },
  ];
  for (const e of envs) {
    const abs = resolve(ROOT, e.path);
    if (existsSync(abs)) {
      const size = statSync(abs).size;
      if (size === 0) record('warn', e.label, 'empty file — populate from env.template');
      else record('pass', e.label, `${size}B`);
    } else {
      const tpl = resolve(ROOT, e.path.replace(/\/[^/]+$/, '/env.template'));
      const hint = existsSync(tpl) ? 'copy from env.template' : 'create from docs';
      record('fail', e.label, `missing — ${hint}`);
    }
  }
}

// 7. node_modules presence
{
  const nm = resolve(ROOT, 'node_modules');
  if (!existsSync(nm)) record('fail', 'node_modules', 'missing — run: pnpm install');
  else {
    const lockAge = ageHours(resolve(ROOT, 'pnpm-lock.yaml'));
    const nmAge = ageHours(nm);
    if (lockAge != null && nmAge != null && lockAge < nmAge - 1)
      record('warn', 'node_modules', `pnpm-lock.yaml is newer — run: pnpm install`);
    else record('pass', 'node_modules', 'present');
  }
}

// 8. Build artifacts freshness (worker dist)
{
  const dist = resolve(ROOT, 'workers/audit-worker/dist');
  if (!existsSync(dist)) record('warn', 'audit-worker/dist', 'not built — pnpm --filter audit-worker build');
  else {
    const distAge = ageHours(dist);
    const srcDir = resolve(ROOT, 'workers/audit-worker/src');
    let staleSrc = false;
    try {
      const srcAge = ageHours(srcDir);
      if (srcAge != null && distAge != null && srcAge < distAge - 0.1) staleSrc = false;
      else staleSrc = srcAge != null && distAge != null && srcAge > distAge;
    } catch {}
    if (staleSrc) record('warn', 'audit-worker/dist', 'src/ newer than dist — rebuild recommended');
    else record('pass', 'audit-worker/dist', `built ${distAge?.toFixed(1)}h ago`);
  }
}

// 9. .firebaserc project id
{
  const rc = resolve(ROOT, '.firebaserc');
  if (!existsSync(rc)) record('warn', '.firebaserc', 'missing — firebase use <project-id>');
  else {
    try {
      const j = JSON.parse(readFileSync(rc, 'utf8'));
      const def = j?.projects?.default;
      if (!def) record('warn', '.firebaserc', 'no default project');
      else if (def.startsWith('demo-')) record('pass', '.firebaserc', `${def} (demo mode)`);
      else record('pass', '.firebaserc', def);
    } catch (e) {
      record('fail', '.firebaserc', `parse error: ${e.message}`);
    }
  }
}

// 10. Workspace packages
{
  const ws = resolve(ROOT, 'pnpm-workspace.yaml');
  if (!existsSync(ws)) record('fail', 'pnpm-workspace.yaml', 'missing');
  else {
    const expected = ['apps/web', 'workers/audit-worker', 'packages/audit-core', 'packages/shared-types', 'packages/ui', 'functions'];
    const missing = expected.filter((p) => !existsSync(resolve(ROOT, p, 'package.json')));
    if (missing.length) record('fail', 'workspace packages', `missing: ${missing.join(', ')}`);
    else record('pass', 'workspace packages', `${expected.length} packages`);
  }
}

// Summary
const fail = results.filter((r) => r.status === 'fail').length;
const warn = results.filter((r) => r.status === 'warn').length;
const pass = results.filter((r) => r.status === 'pass').length;
console.log(c.bold('\nSummary'));
console.log(`  ${c.pass} ${pass}   ${c.warn} ${warn}   ${c.fail} ${fail}\n`);

if (fail > 0) {
  console.log('Fix FAIL items before running `pnpm dev:full`.\n');
  process.exit(1);
} else if (warn > 0) {
  console.log('Warnings present — `pnpm dev:full` may still work.\n');
  process.exit(0);
} else {
  console.log('All checks green. Run: pnpm dev:full\n');
  process.exit(0);
}
