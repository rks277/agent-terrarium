export const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  repo_path TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_active TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL REFERENCES repos(repo_path),
  source TEXT NOT NULL,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  model TEXT,
  transcript_path TEXT,
  pid INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_path);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS token_usage (
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  model TEXT NOT NULL,
  input INTEGER NOT NULL,
  output INTEGER NOT NULL,
  cache_read INTEGER NOT NULL,
  cache_creation INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_index)
);
`;
