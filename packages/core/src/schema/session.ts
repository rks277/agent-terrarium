import type { AdapterSource, SessionStateName } from './events.js';

export type SessionState = SessionStateName;

export type SessionRow = {
  sessionId: string;
  repoPath: string;
  source: AdapterSource;
  state: SessionState;
  startedAt: string;
  endedAt: string | null;
  model: string | null;
  transcriptPath: string | null;
  pid: number | null;
};

export const TERMINAL_STATES: ReadonlySet<SessionState> = new Set<SessionState>(['ended']);

export function isTerminal(state: SessionState): boolean {
  return TERMINAL_STATES.has(state);
}
