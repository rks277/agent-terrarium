import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  closeDb,
  countEventsSince,
  getSession,
  insertEvent,
  listSessions,
  openDb,
  recordTokenUsage,
  updateSessionState,
  upsertRepo,
  upsertSession,
  type DbHandle,
} from './sqlite.js';
import type { EventEnvelope } from '../schema/events.js';

let tempDir: string;
let dbPath: string;
let handle: DbHandle;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'repo-orch-test-'));
  dbPath = path.join(tempDir, 'state.db');
  handle = openDb(dbPath);
});

afterEach(() => {
  closeDb(handle);
  rmSync(tempDir, { recursive: true, force: true });
});

describe('migration', () => {
  it('runs cleanly on a fresh DB and is a no-op on existing DB', () => {
    closeDb(handle);
    handle = openDb(dbPath);
    handle = openDb(dbPath);
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    expect(listSessions(handle)).toEqual([]);
  });
});

describe('upsertRepo', () => {
  it('is idempotent; first_seen sticks, last_active updates', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertRepo(handle, '/repo/a', '2026-05-17T00:00:00Z');
    const row = handle.db.prepare(`SELECT * FROM repos WHERE repo_path = ?`).get('/repo/a') as {
      first_seen: string;
      last_active: string;
    };
    expect(row.first_seen).toBe('2026-05-16T00:00:00Z');
    expect(row.last_active).toBe('2026-05-17T00:00:00Z');
  });
});

describe('upsertSession & updateSessionState', () => {
  it('round-trips correctly', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
      model: 'claude-opus-4-7',
      transcriptPath: '/tmp/t.jsonl',
      pid: 42,
    });
    let row = getSession(handle, 's1');
    expect(row?.state).toBe('running');
    expect(row?.model).toBe('claude-opus-4-7');
    expect(row?.pid).toBe(42);

    updateSessionState(handle, 's1', 'ended', '2026-05-16T01:00:00Z');
    row = getSession(handle, 's1');
    expect(row?.state).toBe('ended');
    expect(row?.endedAt).toBe('2026-05-16T01:00:00Z');
  });
});

describe('insertEvent', () => {
  it('returns true on first insert, false on dedupe collision', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
    });
    const event: EventEnvelope = {
      eventId: 'evt-1',
      type: 'tool.used',
      source: 'claude-code',
      sessionId: 's1',
      repoPath: '/repo/a',
      occurredAt: '2026-05-16T00:00:01Z',
      ingestedAt: '2026-05-16T00:00:02Z',
      payload: { toolName: 'Read' },
    };
    const dupe = 's1:tool.used:abc';
    expect(insertEvent(handle, event, dupe)).toBe(true);
    expect(insertEvent(handle, { ...event, eventId: 'evt-2' }, dupe)).toBe(false);
  });

  it('allows different dedupe keys', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
    });
    const e1: EventEnvelope = {
      eventId: 'a',
      type: 'tool.used',
      source: 'claude-code',
      sessionId: 's1',
      repoPath: '/repo/a',
      occurredAt: '2026-05-16T00:00:01Z',
      ingestedAt: '2026-05-16T00:00:02Z',
      payload: { toolName: 'Read' },
    };
    expect(insertEvent(handle, e1, 'k1')).toBe(true);
    expect(insertEvent(handle, { ...e1, eventId: 'b' }, 'k2')).toBe(true);
  });
});

describe('recordTokenUsage', () => {
  it('round-trips all six numeric fields', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
    });
    recordTokenUsage(handle, {
      sessionId: 's1',
      turnIndex: 0,
      model: 'claude-opus-4-7',
      input: 100,
      output: 200,
      cacheRead: 50,
      cacheCreation: 25,
      occurredAt: '2026-05-16T00:00:10Z',
    });
    const r = handle.db
      .prepare(`SELECT * FROM token_usage WHERE session_id = ? AND turn_index = ?`)
      .get('s1', 0) as {
      input: number;
      output: number;
      cache_read: number;
      cache_creation: number;
      model: string;
      occurred_at: string;
    };
    expect(r.input).toBe(100);
    expect(r.output).toBe(200);
    expect(r.cache_read).toBe(50);
    expect(r.cache_creation).toBe(25);
    expect(r.model).toBe('claude-opus-4-7');
    expect(r.occurred_at).toBe('2026-05-16T00:00:10Z');
  });
});

describe('listSessions', () => {
  it('filters by state and repo', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertRepo(handle, '/repo/b', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
    });
    upsertSession(handle, {
      sessionId: 's2',
      repoPath: '/repo/b',
      source: 'claude-code',
      state: 'ended',
      startedAt: '2026-05-16T00:00:01Z',
    });
    expect(listSessions(handle, { state: 'running' })).toHaveLength(1);
    expect(listSessions(handle, { state: 'running' })[0]?.sessionId).toBe('s1');
    expect(listSessions(handle, { repoPath: '/repo/b' })).toHaveLength(1);
    expect(listSessions(handle, { repoPath: '/repo/b' })[0]?.sessionId).toBe('s2');
    expect(listSessions(handle)).toHaveLength(2);
  });
});

describe('countEventsSince', () => {
  it('counts events ingested since a timestamp', () => {
    upsertRepo(handle, '/repo/a', '2026-05-16T00:00:00Z');
    upsertSession(handle, {
      sessionId: 's1',
      repoPath: '/repo/a',
      source: 'claude-code',
      state: 'running',
      startedAt: '2026-05-16T00:00:00Z',
    });
    insertEvent(
      handle,
      {
        eventId: 'a',
        type: 'tool.used',
        source: 'claude-code',
        sessionId: 's1',
        repoPath: '/repo/a',
        occurredAt: '2026-05-16T00:00:01Z',
        ingestedAt: '2026-05-16T00:00:01Z',
        payload: { toolName: 'X' },
      },
      'k1',
    );
    insertEvent(
      handle,
      {
        eventId: 'b',
        type: 'tool.used',
        source: 'claude-code',
        sessionId: 's1',
        repoPath: '/repo/a',
        occurredAt: '2026-05-16T01:00:00Z',
        ingestedAt: '2026-05-16T01:00:00Z',
        payload: { toolName: 'Y' },
      },
      'k2',
    );
    expect(countEventsSince(handle, '2026-05-16T00:30:00Z')).toBe(1);
    expect(countEventsSince(handle, '2026-05-15T00:00:00Z')).toBe(2);
  });
});
