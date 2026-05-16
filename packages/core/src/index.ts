export type {
  AdapterSource,
  EventEnvelope,
  EventType,
  NotificationKind,
  PayloadFor,
  PayloadMap,
  SessionEndReason,
  SessionStateName,
  TokenUsage,
} from './schema/events.js';

export type { SessionRow, SessionState } from './schema/session.js';
export { isTerminal, TERMINAL_STATES } from './schema/session.js';

export { reduceSessionState } from './state/session-fsm.js';

export {
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
} from './storage/sqlite.js';
export type {
  DbHandle,
  ListSessionsFilter,
  RecentEventCountsRow,
  RecordTokenUsageInput,
  UpsertSessionInput,
} from './storage/sqlite.js';
