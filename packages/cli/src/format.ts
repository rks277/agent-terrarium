import type { EventEnvelope } from '@repo-orch/core';

function shortSession(sessionId: string): string {
  return sessionId.slice(0, 7);
}

function relativeAgo(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function summarizePayload(event: EventEnvelope): string {
  switch (event.type) {
    case 'session.started':
      return event.payload.model ?? '';
    case 'session.ended':
      return event.payload.reason;
    case 'session.state_changed':
      return `${event.payload.from} → ${event.payload.to}`;
    case 'prompt.submitted':
      return `length=${event.payload.length}`;
    case 'assistant.turn_completed': {
      const u = event.payload.usage;
      return `in=${u.input} out=${u.output} cr=${u.cacheRead} cc=${u.cacheCreation}`;
    }
    case 'tool.used':
      return event.payload.toolName;
    case 'permission.requested':
      return event.payload.toolName;
    case 'permission.resolved':
      return `${event.payload.toolName} allowed=${event.payload.allowed}`;
    case 'notification.received':
      return event.payload.text;
  }
}

export function prettyEvent(event: EventEnvelope): string {
  const time = event.occurredAt.replace('T', ' ').replace(/\..*Z$/, 'Z');
  return `${time} [${shortSession(event.sessionId)}] ${event.type} — ${summarizePayload(event)}`;
}

export type SessionLike = {
  sessionId: string;
  repoPath: string;
  state: string;
  startedAt: string;
  model: string | null;
};

export function renderSessionsTable(sessions: SessionLike[], nowMs: number = Date.now()): string {
  if (sessions.length === 0) return '(no sessions tracked yet)';
  const rows = sessions.map((s) => ({
    session: shortSession(s.sessionId),
    repo: s.repoPath,
    state: s.state,
    started: relativeAgo(s.startedAt, nowMs),
    model: s.model ?? '',
  }));
  const headers = { session: 'SESSION', repo: 'REPO', state: 'STATE', started: 'STARTED', model: 'MODEL' };
  const widths = {
    session: Math.max(headers.session.length, ...rows.map((r) => r.session.length)),
    repo: Math.max(headers.repo.length, ...rows.map((r) => r.repo.length)),
    state: Math.max(headers.state.length, ...rows.map((r) => r.state.length)),
    started: Math.max(headers.started.length, ...rows.map((r) => r.started.length)),
    model: Math.max(headers.model.length, ...rows.map((r) => r.model.length)),
  };
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  const lines = [
    `${pad(headers.session, widths.session)}  ${pad(headers.repo, widths.repo)}  ${pad(headers.state, widths.state)}  ${pad(headers.started, widths.started)}  ${pad(headers.model, widths.model)}`,
    ...rows.map(
      (r) =>
        `${pad(r.session, widths.session)}  ${pad(r.repo, widths.repo)}  ${pad(r.state, widths.state)}  ${pad(r.started, widths.started)}  ${pad(r.model, widths.model)}`,
    ),
  ];
  return lines.join('\n');
}
