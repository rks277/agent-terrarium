import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  openDb,
  closeDb,
  getSession,
  type DbHandle,
  type EventEnvelope,
} from '@repo-orch/core';
import { createEventBus } from './event-bus.js';
import { createIngestPipeline } from './ingest-pipeline.js';

let tempDir: string;
let dbHandle: DbHandle;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'pipe-test-'));
  dbHandle = openDb(path.join(tempDir, 'state.db'));
});

afterEach(() => {
  closeDb(dbHandle);
  rmSync(tempDir, { recursive: true, force: true });
});

function ev<T extends EventEnvelope['type']>(
  type: T,
  payload: Extract<EventEnvelope, { type: T }>['payload'],
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    eventId: Math.random().toString(36).slice(2),
    type,
    source: 'claude-code',
    sessionId: 's1',
    repoPath: '/r',
    occurredAt: '2026-05-16T10:00:00.000Z',
    ingestedAt: '2026-05-16T10:00:00.500Z',
    payload,
    ...overrides,
  } as EventEnvelope;
}

describe('ingest pipeline', () => {
  it('persists, publishes, and synthesizes state_changed', () => {
    const bus = createEventBus();
    const published: EventEnvelope[] = [];
    bus.subscribe((e) => published.push(e));
    const pipeline = createIngestPipeline({ db: dbHandle, bus });

    pipeline.ingest(ev('session.started', { model: 'claude-opus-4-7' }));
    pipeline.ingest(
      ev('permission.requested', { toolName: 'Bash' }, { occurredAt: '2026-05-16T10:01:00.000Z' }),
    );

    const types = published.map((e) => e.type);
    expect(types).toContain('session.started');
    expect(types).toContain('permission.requested');
    expect(types).toContain('session.state_changed');

    const session = getSession(dbHandle, 's1');
    expect(session?.state).toBe('awaiting_permission');
  });

  it('dedupes identical events', () => {
    const bus = createEventBus();
    const published: EventEnvelope[] = [];
    bus.subscribe((e) => published.push(e));
    const pipeline = createIngestPipeline({ db: dbHandle, bus });

    pipeline.ingest(ev('session.started', { model: 'm' }));
    pipeline.ingest(ev('session.started', { model: 'm' }, { eventId: 'different-id' }));

    const startCount = published.filter((e) => e.type === 'session.started').length;
    expect(startCount).toBe(1);
  });

  it('records token usage for assistant.turn_completed', () => {
    const bus = createEventBus();
    const pipeline = createIngestPipeline({ db: dbHandle, bus });

    pipeline.ingest(ev('session.started', { model: 'm' }));
    pipeline.ingest(
      ev('assistant.turn_completed', {
        model: 'claude-opus-4-7',
        usage: { input: 100, output: 50, cacheRead: 10, cacheCreation: 5 },
      }),
    );

    const row = dbHandle.db
      .prepare(`SELECT * FROM token_usage WHERE session_id = ?`)
      .all('s1') as { input: number; output: number }[];
    expect(row).toHaveLength(1);
    expect(row[0]?.input).toBe(100);
    expect(row[0]?.output).toBe(50);
  });
});
