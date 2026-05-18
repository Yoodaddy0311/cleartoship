#!/usr/bin/env node
// Boot web + worker + firebase emulators in parallel with prefixed, color-coded logs.
// Usage: pnpm dev:full

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const palette = ['36', '35', '33', '32', '34']; // cyan, magenta, yellow, green, blue
const paint = (s, code) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);

function augmentPathForAuditTools() {
  if (process.platform !== 'win32') return process.env.PATH;
  const sep = ';';
  const extra = [];
  const appData = process.env.APPDATA;
  const localApp = process.env.LOCALAPPDATA;
  const candidates = [
    appData ? `${appData}\\Python\\Python312\\Scripts` : null,
    localApp
      ? `${localApp}\\Microsoft\\WinGet\\Packages\\Google.OSVScanner_Microsoft.Winget.Source_8wekyb3d8bbwe`
      : null,
  ].filter(Boolean);
  const current = process.env.PATH ?? '';
  const lower = current.toLowerCase();
  for (const dir of candidates) {
    if (existsSync(dir) && !lower.includes(dir.toLowerCase())) extra.push(dir);
  }
  return extra.length ? `${extra.join(sep)}${sep}${current}` : current;
}

const AUGMENTED_PATH = augmentPathForAuditTools();
const CHILD_ENV = { ...process.env, PATH: AUGMENTED_PATH };

const services = [
  { name: 'emulators', cmd: 'pnpm', args: ['emulators'] },
  { name: 'web      ', cmd: 'pnpm', args: ['--filter', 'web', 'dev'] },
  { name: 'worker   ', cmd: 'pnpm', args: ['--filter', 'audit-worker', 'dev'] },
];

const children = [];
let shuttingDown = false;

function prefix(name, idx) {
  const color = palette[idx % palette.length];
  return paint(`[${name}]`, color);
}

function pipe(child, name, idx) {
  const tag = prefix(name, idx);
  const wire = (stream, isErr) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const out = `${tag} ${line}`;
        if (isErr) process.stderr.write(out + '\n');
        else process.stdout.write(out + '\n');
      }
    });
    stream.on('end', () => {
      if (buf) {
        const out = `${tag} ${buf}`;
        (isErr ? process.stderr : process.stdout).write(out + '\n');
      }
    });
  };
  wire(child.stdout, false);
  wire(child.stderr, true);
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n${paint('[dev:full]', '31')} shutting down (${reason})...\n`);
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill(process.platform === 'win32' ? undefined : 'SIGINT');
      } catch {}
    }
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

services.forEach((svc, idx) => {
  const child = spawn(svc.cmd, svc.args, {
    cwd: ROOT,
    env: CHILD_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  children.push({ name: svc.name, child });
  pipe(child, svc.name.trim(), idx);
  child.on('exit', (code, signal) => {
    process.stdout.write(`${prefix(svc.name.trim(), idx)} exited code=${code} signal=${signal ?? ''}\n`);
    if (!shuttingDown) shutdown(`${svc.name.trim()} exited`);
  });
  child.on('error', (err) => {
    process.stderr.write(`${prefix(svc.name.trim(), idx)} spawn error: ${err.message}\n`);
    if (!shuttingDown) shutdown(`${svc.name.trim()} spawn error`);
  });
});

if (AUGMENTED_PATH !== process.env.PATH) {
  process.stdout.write(
    `${paint('[dev:full]', '32')} augmented PATH for semgrep/osv-scanner (user PATH unchanged)\n`,
  );
}
process.stdout.write(`${paint('[dev:full]', '32')} booting emulators + web + worker (Ctrl+C to stop)\n`);
