import { access } from 'node:fs/promises';
import { resolvePaths } from '@repo-orch/daemon';
import { connectSocket } from '../socket-client.js';

export type DoctorOptions = { home?: string };

type Check = { name: string; ok: boolean; detail?: string };

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<number> {
  const paths = resolvePaths(opts.home);
  const checks: Check[] = [];

  checks.push({ name: '~/.repo-orch/ exists', ok: await exists(paths.root) });
  checks.push({ name: 'daemon socket exists', ok: await exists(paths.socket) });

  let pingOk = false;
  let health: { eventsLast24h: number; sessions: number } | null = null;
  try {
    const client = await connectSocket(paths.socket);
    client.send({ op: 'ping' });
    const pong = (await Promise.race([
      client.next(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000)),
    ])) as { pong?: true };
    pingOk = pong?.pong === true;
    client.send({ op: 'health' });
    const healthMsg = (await Promise.race([
      client.next(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000)),
    ])) as { health?: { eventsLast24h: number; sessions: number } };
    health = healthMsg?.health ?? null;
    client.close();
  } catch {
    pingOk = false;
  }
  checks.push({ name: 'daemon responds to ping', ok: pingOk });
  checks.push({
    name: 'plugin installed at ~/.claude/plugins/repo-orch/',
    ok: await exists(paths.claudePluginRoot),
  });
  checks.push({
    name: '~/.claude/projects/ accessible',
    ok: await exists(paths.claudeProjects),
  });
  checks.push({
    name: 'events ingested in last 24h',
    ok: (health?.eventsLast24h ?? 0) > 0,
    detail: health ? `${health.eventsLast24h} events` : 'unknown',
  });

  for (const c of checks) {
    const symbol = c.ok ? '✓' : '✗';
    const detail = c.detail ? ` (${c.detail})` : '';
    process.stdout.write(`${symbol} ${c.name}${detail}\n`);
  }
  return checks.every((c) => c.ok) ? 0 : 1;
}
