#!/usr/bin/env node
// Free Firebase emulator ports occupied by stale processes.
// Usage:
//   pnpm free-ports              # dry-run: list owners only
//   pnpm free-ports --kill       # stop owning processes (after confirmation)
//   pnpm free-ports --kill --yes # skip confirmation (CI/scripted use)

import { execSync, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const PORTS = [
  { p: 4000, name: 'ui' },
  { p: 5000, name: 'hosting' },
  { p: 5001, name: 'functions' },
  { p: 8080, name: 'firestore' },
  { p: 9099, name: 'auth' },
  { p: 9199, name: 'storage' },
];

const args = process.argv.slice(2);
const KILL = args.includes('--kill');
const YES = args.includes('--yes') || args.includes('-y');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const dim = (s) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s);

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

function findOwners(busyPorts) {
  const owners = new Map(); // port -> { pid, name }
  if (process.platform !== 'win32') {
    // Best-effort POSIX via lsof. Fall through gracefully if absent.
    for (const { p } of busyPorts) {
      try {
        const out = execSync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`, {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim()
          .split(/\r?\n/)[0];
        if (out) owners.set(p, { pid: out, name: '?' });
      } catch {}
    }
    return owners;
  }
  // Windows: netstat -ano + Get-Process for names.
  try {
    const ns = execSync('netstat -ano', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    for (const { p } of busyPorts) {
      const re = new RegExp(`\\s127\\.0\\.0\\.1:${p}\\b.*LISTENING\\s+(\\d+)`);
      const m = ns.match(re);
      if (m) owners.set(p, { pid: m[1], name: '?' });
    }
    const pids = [...new Set([...owners.values()].map((v) => v.pid))];
    if (pids.length) {
      try {
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
          for (const [port, info] of owners) {
            owners.set(port, { ...info, name: nameByPid.get(info.pid) ?? '?' });
          }
        }
      } catch {}
    }
  } catch {}
  return owners;
}

function looksLikeEmulator(owners) {
  const names = [...owners.values()].map((v) => String(v.name).toLowerCase());
  if (names.length === 0) return false;
  return names.every((n) => ['node', 'java', 'node.exe', 'java.exe'].includes(n));
}

async function confirm(msg) {
  if (YES) return true;
  const rl = createInterface({ input, output });
  try {
    const ans = (await rl.question(`${msg} [y/N] `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

function stopProcess(pid) {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Stop-Process -Id ${pid} -Force -ErrorAction Stop`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: r.status === 0, err: r.stderr?.toString().trim() ?? '' };
  }
  const r = spawnSync('kill', ['-9', String(pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, err: r.stderr?.toString().trim() ?? '' };
}

(async function main() {
  console.log(bold('\nClearToShip free-ports\n'));
  const checks = await Promise.all(
    PORTS.map((x) => portOpen(x.p).then((open) => ({ ...x, open }))),
  );
  const busy = checks.filter((x) => x.open);
  if (busy.length === 0) {
    console.log(green('All emulator ports free.') + ' ' + dim('4000/5000/5001/8080/9099/9199\n'));
    process.exit(0);
  }

  const owners = findOwners(busy);
  console.log(yellow(`${busy.length} port(s) occupied:`));
  for (const { p, name } of busy) {
    const o = owners.get(p);
    const ownerStr = o ? `pid=${o.pid} (${o.name})` : 'owner unknown';
    console.log(`  - ${p} (${name}) ${dim('— ' + ownerStr)}`);
  }
  console.log();

  const isEmu = looksLikeEmulator(owners);
  if (isEmu) {
    console.log(dim('Pattern matches stale firebase emulator (node + java).'));
  } else {
    console.log(
      yellow(
        'Warning: owner(s) do not look like firebase emulator. They may be unrelated services.',
      ),
    );
  }

  if (!KILL) {
    console.log(
      `\n${dim('Dry-run.')} Re-run with ${bold('--kill')} to stop the owning process(es), or stop them manually.\n`,
    );
    process.exit(busy.length === 0 ? 0 : 1);
  }

  const uniquePids = [...new Set([...owners.values()].map((v) => v.pid))].filter(Boolean);
  if (uniquePids.length === 0) {
    console.log(red('No PIDs resolved — cannot kill. Stop the listeners manually.\n'));
    process.exit(1);
  }

  if (!isEmu) {
    const ok = await confirm(
      `Owners do not match the emulator signature. Kill ${uniquePids.length} process(es) anyway?`,
    );
    if (!ok) {
      console.log(dim('Aborted.\n'));
      process.exit(1);
    }
  } else if (!YES) {
    const ok = await confirm(`Stop ${uniquePids.length} stale emulator process(es)?`);
    if (!ok) {
      console.log(dim('Aborted.\n'));
      process.exit(1);
    }
  }

  let failed = 0;
  for (const pid of uniquePids) {
    const { ok, err } = stopProcess(pid);
    if (ok) console.log(green(`  stopped pid=${pid}`));
    else {
      failed += 1;
      console.log(red(`  failed pid=${pid}`) + (err ? dim(` — ${err}`) : ''));
    }
  }

  // Re-check after a short delay.
  await new Promise((r) => setTimeout(r, 400));
  const recheck = await Promise.all(
    PORTS.map((x) => portOpen(x.p).then((open) => ({ ...x, open }))),
  );
  const stillBusy = recheck.filter((x) => x.open);
  if (stillBusy.length === 0) {
    console.log(`\n${green('All emulator ports free.')} Run: ${bold('pnpm emulators')}\n`);
    process.exit(0);
  } else {
    console.log(
      `\n${red('Still occupied:')} ${stillBusy.map((x) => `${x.p}(${x.name})`).join(', ')}\n`,
    );
    process.exit(failed ? 1 : 1);
  }
})();
