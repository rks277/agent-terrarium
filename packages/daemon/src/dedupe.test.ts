import { describe, it, expect } from 'vitest';
import { dedupeKeyFor } from './dedupe.js';
import type { EventEnvelope } from '@repo-orch/core';

function build(overrides: Partial<EventEnvelope>): EventEnvelope {
  return {
    eventId: 'e',
    type: 'tool.used',
    source: 'claude-code',
    sessionId: 's1',
    repoPath: '/r',
    occurredAt: '2026-05-16T10:00:00.123Z',
    ingestedAt: '2026-05-16T10:00:00.500Z',
    payload: { toolName: 'Read' },
    ...overrides,
  } as EventEnvelope;
}

describe('dedupeKeyFor', () => {
  it('session.started keys are identical regardless of payload', () => {
    const a = build({ type: 'session.started', payload: { model: 'A' } });
    const b = build({ type: 'session.started', payload: {} });
    expect(dedupeKeyFor(a)).toEqual(dedupeKeyFor(b));
  });

  it('tool.used keys round to the second', () => {
    const a = build({ occurredAt: '2026-05-16T10:00:00.000Z' });
    const b = build({ occurredAt: '2026-05-16T10:00:00.999Z' });
    expect(dedupeKeyFor(a)).toEqual(dedupeKeyFor(b));
  });

  it('different sessions yield different keys', () => {
    const a = build({ sessionId: 'A' });
    const b = build({ sessionId: 'B' });
    expect(dedupeKeyFor(a)).not.toEqual(dedupeKeyFor(b));
  });

  it('assistant.turn_completed keyed by usage values', () => {
    const a = build({
      type: 'assistant.turn_completed',
      payload: {
        model: 'm',
        usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
      },
    });
    const b = build({
      type: 'assistant.turn_completed',
      payload: {
        model: 'm',
        usage: { input: 2, output: 1, cacheRead: 0, cacheCreation: 0 },
      },
    });
    expect(dedupeKeyFor(a)).not.toEqual(dedupeKeyFor(b));
  });
});
