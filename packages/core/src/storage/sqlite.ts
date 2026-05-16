import Database from 'better-sqlite3';
import type { Database as DatabaseT } from 'better-sqlite3';
import type {
  AdapterSource,
  EventEnvelope,
  EventType,
} from '../schema/events.js';
import type { SessionRow, SessionState } from '../schema/session.js';
import { INIT_SCHEMA_SQL } from './schema.js';

export type DbHandle = { readonly db: DatabaseT };

type SessionRowRaw = {
  session_id: string;
  repo_path: string;
  source: string;
  state: string;
  started_at: string;
  ended_at: string | null;
  model: string | null;
  transcript_path: string | null;
  pid: number | null;
};

function toSessionRow(r: SessionRowRaw): SessionRow {
  return {
    sessionId: r.session_id,
    repoPath: r.repo_path,
    source: r.source as AdapterSource,
    state: r.state as SessionState,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    model: r.model,
    transcriptPath: r.transcript_path,
    pid: r.pid,
  };
}

export function openDb(path: string): DbHandle {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(INIT_SCHEMA_SQL);
  return { db };
}

export function closeDb(handle: DbHandle): void {
  handle.db.close();
}

export function upsertRepo(handle: DbHandle, repoPath: string, now: string): void {
  handle.db
    .prepare(
      `INSERT INTO repos (repo_path, first_seen, last_active)
       VALUES (?, ?, ?)
       ON CONFLICT(repo_path) DO UPDATE SET last_active = excluded.last_active`,
    )
    .run(repoPath, now, now);
}

export type UpsertSessionInput = {
  sessionId: string;
  repoPath: string;
  source: AdapterSource;
  state: SessionState;
  startedAt: string;
  model?: string | null;
  transcriptPath?: string | null;
  pid?: number | null;
};

export function upsertSession(handle: DbHandle, s: UpsertSessionInput): void {
  handle.db
    .prepare(
      `INSERT INTO sessions
         (session_id, repo_path, source, state, started_at, ended_at, model, transcript_path, pid)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         repo_path = excluded.repo_path,
         source = excluded.source,
         state = excluded.state,
         started_at = sessions.started_at,
         model = COALESCE(excluded.model, sessions.model),
         transcript_path = COALESCE(excluded.transcript_path, sessions.transcript_path),
         pid = COALESCE(excluded.pid, sessions.pid)`,
    )
    .run(
      s.sessionId,
      s.repoPath,
      s.source,
      s.state,
      s.startedAt,
      s.model ?? null,
      s.transcriptPath ?? null,
      s.pid ?? null,
    );
}

export function updateSessionState(
  handle: DbHandle,
  sessionId: string,
  state: SessionState,
  endedAt?: string,
): void {
  if (endedAt !== undefined) {
    handle.db
      .prepare(`UPDATE sessions SET state = ?, ended_at = ? WHERE session_id = ?`)
      .run(state, endedAt, sessionId);
  } else {
    handle.db
      .prepare(`UPDATE sessions SET state = ? WHERE session_id = ?`)
      .run(state, sessionId);
  }
}

export function insertEvent(
  handle: DbHandle,
  event: EventEnvelope,
  dedupeKey: string,
): boolean {
  const info = handle.db
    .prepare(
      `INSERT INTO events
         (event_id, session_id, type, occurred_at, ingested_at, payload_json, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .run(
      event.eventId,
      event.sessionId,
      event.type,
      event.occurredAt,
      event.ingestedAt,
      JSON.stringify(event.payload),
      dedupeKey,
    );
  return info.changes > 0;
}

export type RecordTokenUsageInput = {
  sessionId: string;
  turnIndex: number;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  occurredAt: string;
};

export function recordTokenUsage(handle: DbHandle, row: RecordTokenUsageInput): void {
  handle.db
    .prepare(
      `INSERT INTO token_usage
         (session_id, turn_index, model, input, output, cache_read, cache_creation, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, turn_index) DO UPDATE SET
         model = excluded.model,
         input = excluded.input,
         output = excluded.output,
         cache_read = excluded.cache_read,
         cache_creation = excluded.cache_creation,
         occurred_at = excluded.occurred_at`,
    )
    .run(
      row.sessionId,
      row.turnIndex,
      row.model,
      row.input,
      row.output,
      row.cacheRead,
      row.cacheCreation,
      row.occurredAt,
    );
}

export type ListSessionsFilter = {
  state?: SessionState;
  repoPath?: string;
};

export function listSessions(handle: DbHandle, filter: ListSessionsFilter = {}): SessionRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.state !== undefined) {
    where.push('state = ?');
    params.push(filter.state);
  }
  if (filter.repoPath !== undefined) {
    where.push('repo_path = ?');
    params.push(filter.repoPath);
  }
  const sql = `SELECT * FROM sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY started_at DESC`;
  const rows = handle.db.prepare(sql).all(...params) as SessionRowRaw[];
  return rows.map(toSessionRow);
}

export function getSession(handle: DbHandle, sessionId: string): SessionRow | undefined {
  const r = handle.db
    .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
    .get(sessionId) as SessionRowRaw | undefined;
  return r ? toSessionRow(r) : undefined;
}

export type RecentEventCountsRow = {
  type: EventType;
  count: number;
};

export function countEventsSince(handle: DbHandle, sinceIso: string): number {
  const r = handle.db
    .prepare(`SELECT COUNT(*) as n FROM events WHERE ingested_at >= ?`)
    .get(sinceIso) as { n: number };
  return r.n;
}
