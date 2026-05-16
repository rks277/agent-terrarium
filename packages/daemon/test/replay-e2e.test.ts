import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect } from 'node:net';
import readline from 'node:readline';
import { startDaemon, type DaemonHandle } from '../src/index.js';
import type { EventEnvelope } from '@repo-orch/core';

let tempHome: string;
let daemon: DaemonHandle;

beforeEach(async () => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'replay-e2e-'));
  mkdirSync(path.join(tempHome, '.claude', 'projects', '-repo-fixture'), { recursive: true });
  mkdirSync(path.join(tempHome, '.claude', 'sessions'), { recursive: true });
  daemon = await startDaemon({ home: tempHome });
});

afterEach(async () => {
  await daemon.stop();
  rmSync(tempHome, { recursive: true, force: true });
});

function connectAndSubscribe(): Promise<{ events: EventEnvelope[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const sock = connect(daemon.paths.socket);
    const events: EventEnvelope[] = [];
    sock.once('connect', () => {
      const rl = readline.createInterface({ input: sock, crlfDelay: Infinity });
      rl.on('line', (line: string) => {
        try {
          const msg = JSON.parse(line);
          if (msg.event) events.push(msg.event as EventEnvelope);
        } catch {
          /* ignore */
        }
      });
      sock.write(JSON.stringify({ op: 'subscribe' }) + '\n');
      setTimeout(() => resolve({ events, close: () => sock.end() }), 50);
    });
    sock.once('error', reject);
  });
}

const LINE_USER =
  '{"type":"user","sessionId":"sess-e2e","timestamp":"2026-05-16T10:00:00.000Z","cwd":"/repo/fixture","message":{"role":"user","content":"hello"}}\n';
const LINE_ASSISTANT =
  '{"type":"assistant","sessionId":"sess-e2e","timestamp":"2026-05-16T10:00:02.000Z","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"tool_use","name":"Read","id":"t1","input":{}}],"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}\n';

describe('replay E2E: transcript + hook → dedupe → socket stream → DB', () => {
  it('produces dedupes a session.started arriving from both sources', async () => {
    const { events, close } = await connectAndSubscribe();

    const transcriptPath = path.join(
      tempHome,
      '.claude',
      'projects',
      '-repo-fixture',
      'sess-e2e.jsonl',
    );
    await writeFile(transcriptPath, LINE_USER);
    await new Promise((r) => setTimeout(r, 200));
    await writeFile(transcriptPath, LINE_USER + LINE_ASSISTANT);
    await new Promise((r) => setTimeout(r, 200));

    const hookPayload = {
      session_id: 'sess-e2e',
      cwd: '/repo/fixture',
      hook_event_name: 'SessionStart',
      timestamp: '2026-05-16T10:00:00.000Z',
      model: 'claude-opus-4-7',
    };
    const tmpFile = path.join(daemon.paths.events, '.hook-1.json');
    const finalFile = path.join(daemon.paths.events, 'hook-1.json');
    writeFileSync(tmpFile, JSON.stringify(hookPayload));
    renameSync(tmpFile, finalFile);
    await new Promise((r) => setTimeout(r, 300));

    const startedCount = events.filter((e) => e.type === 'session.started').length;
    expect(startedCount).toBe(1);

    const turnCount = events.filter((e) => e.type === 'assistant.turn_completed').length;
    expect(turnCount).toBe(1);

    const toolCount = events.filter((e) => e.type === 'tool.used').length;
    expect(toolCount).toBeGreaterThanOrEqual(1);

    const sessions = daemon.db.db
      .prepare(`SELECT session_id, state FROM sessions WHERE session_id = ?`)
      .all('sess-e2e') as { session_id: string; state: string }[];
    expect(sessions).toHaveLength(1);

    const tokens = daemon.db.db
      .prepare(`SELECT input, output FROM token_usage WHERE session_id = ?`)
      .all('sess-e2e') as { input: number; output: number }[];
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0]?.input).toBe(100);

    close();
  });
});
