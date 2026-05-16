import { createHash } from 'node:crypto';
import type { EventEnvelope } from '@repo-orch/core';

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

function roundToSecond(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setMilliseconds(0);
  return d.toISOString();
}

export function dedupeKeyFor(event: EventEnvelope): string {
  switch (event.type) {
    case 'session.started':
    case 'session.ended':
      return `${event.sessionId}:${event.type}`;
    case 'session.state_changed':
      return `${event.sessionId}:state:${event.payload.from}->${event.payload.to}:${roundToSecond(event.occurredAt)}`;
    case 'assistant.turn_completed': {
      const u = event.payload.usage;
      return `${event.sessionId}:turn:${shortHash(`${u.input}|${u.output}|${u.cacheRead}|${u.cacheCreation}|${event.occurredAt}`)}`;
    }
    case 'tool.used':
      return `${event.sessionId}:tool:${shortHash(`${event.payload.toolName}|${roundToSecond(event.occurredAt)}`)}`;
    case 'prompt.submitted':
      return `${event.sessionId}:prompt:${shortHash(`${event.payload.length}|${roundToSecond(event.occurredAt)}`)}`;
    case 'permission.requested':
      return `${event.sessionId}:perm-req:${shortHash(`${event.payload.toolName}|${roundToSecond(event.occurredAt)}`)}`;
    case 'permission.resolved':
      return `${event.sessionId}:perm-res:${shortHash(`${event.payload.toolName}|${event.payload.allowed}|${roundToSecond(event.occurredAt)}`)}`;
    case 'notification.received':
      return `${event.sessionId}:notif:${shortHash(event.payload.text)}`;
  }
}
