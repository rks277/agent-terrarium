import type { EventEnvelope, SessionRow } from '@repo-orch/core';

export type SubscribeFilter = {
  sessionId?: string;
  type?: string;
  repoPath?: string;
};

export type ClientMessage =
  | { op: 'subscribe'; filter?: SubscribeFilter }
  | { op: 'status' }
  | { op: 'ping' }
  | { op: 'health' };

export type ServerMessage =
  | { ok: true }
  | { error: string }
  | { pong: true }
  | { event: EventEnvelope }
  | { sessions: SessionRow[] }
  | { health: { eventsLast24h: number; sessions: number } };

export function matchesFilter(event: EventEnvelope, filter: SubscribeFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
  if (filter.repoPath && event.repoPath !== filter.repoPath) return false;
  if (filter.type && !globMatch(filter.type, event.type)) return false;
  return true;
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*' || pattern === value) return true;
  const re = new RegExp(
    '^' +
      pattern
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  return re.test(value);
}
