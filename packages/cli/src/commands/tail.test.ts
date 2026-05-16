import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDaemon, type DaemonHandle } from '@repo-orch/daemon';
import { runStatus } from './status.js';
import { runDoctor } from './doctor.js';
import { runTail } from './tail.js';

let tempHome: string;
let daemon: DaemonHandle;
let originalStdoutWrite: typeof process.stdout.write;
let captured: string;

beforeEach(async () => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'cli-test-'));
  daemon = await startDaemon({ home: tempHome });
  captured = '';
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
});

afterEach(async () => {
  process.stdout.write = originalStdoutWrite;
  await daemon.stop();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('CLI commands against a live daemon', () => {
  it('status prints empty-sessions placeholder', async () => {
    await runStatus({ home: tempHome });
    expect(captured).toContain('no sessions tracked');
  });

  it('doctor reports daemon up', async () => {
    const code = await runDoctor({ home: tempHome });
    expect(captured).toContain('daemon responds to ping');
    expect(captured).toMatch(/✓\s+daemon responds to ping/);
    expect(typeof code).toBe('number');
  });

  it('tail subscribes and prints an event', async () => {
    const controller = new AbortController();
    const tailPromise = runTail({ home: tempHome, pretty: false, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 50));
    daemon.pipeline.ingest({
      eventId: 'ev-1',
      type: 'tool.used',
      source: 'claude-code',
      sessionId: 'sess-x',
      repoPath: '/r',
      occurredAt: '2026-05-16T00:00:00.000Z',
      ingestedAt: '2026-05-16T00:00:00.500Z',
      payload: { toolName: 'Read' },
    });
    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    await tailPromise;
    expect(captured).toContain('"toolName":"Read"');
  });
});
