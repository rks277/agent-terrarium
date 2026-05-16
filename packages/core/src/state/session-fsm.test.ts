import { describe, it, expect } from 'vitest';
import { reduceSessionState } from './session-fsm.js';
import type { EventEnvelope, EventType, PayloadFor } from '../schema/events.js';
import type { SessionState } from '../schema/session.js';

function ev<T extends EventType>(type: T, payload: PayloadFor<T>): EventEnvelope<T> {
  return {
    eventId: 'test-id',
    type,
    source: 'claude-code',
    sessionId: 's1',
    repoPath: '/repo',
    occurredAt: '2026-05-16T00:00:00.000Z',
    ingestedAt: '2026-05-16T00:00:00.000Z',
    payload,
  };
}

describe('reduceSessionState', () => {
  it('unknown + session.started → running', () => {
    expect(reduceSessionState('unknown', ev('session.started', {}))).toBe('running');
  });

  it('running + tool.used → running', () => {
    expect(reduceSessionState('running', ev('tool.used', { toolName: 'Read' }))).toBe('running');
  });

  it('running + permission.requested → awaiting_permission', () => {
    expect(
      reduceSessionState('running', ev('permission.requested', { toolName: 'Bash' })),
    ).toBe('awaiting_permission');
  });

  it('awaiting_permission + permission.resolved (allowed=true) → running', () => {
    expect(
      reduceSessionState(
        'awaiting_permission',
        ev('permission.resolved', { toolName: 'Bash', allowed: true }),
      ),
    ).toBe('running');
  });

  it('awaiting_permission + permission.resolved (allowed=false) → running', () => {
    expect(
      reduceSessionState(
        'awaiting_permission',
        ev('permission.resolved', { toolName: 'Bash', allowed: false }),
      ),
    ).toBe('running');
  });

  it('awaiting_input + prompt.submitted → running', () => {
    expect(
      reduceSessionState('awaiting_input', ev('prompt.submitted', { length: 10 })),
    ).toBe('running');
  });

  it('running + session.ended → ended', () => {
    expect(
      reduceSessionState('running', ev('session.ended', { reason: 'normal' })),
    ).toBe('ended');
  });

  it('ended + any → ended (terminal)', () => {
    const states: SessionState[] = ['running', 'awaiting_input', 'awaiting_permission', 'ended'];
    for (const _ of states) {
      expect(reduceSessionState('ended', ev('session.started', {}))).toBe('ended');
      expect(reduceSessionState('ended', ev('tool.used', { toolName: 'X' }))).toBe('ended');
      expect(reduceSessionState('ended', ev('session.ended', { reason: 'normal' }))).toBe('ended');
    }
  });

  it('running + notification.received(idle) → awaiting_input', () => {
    expect(
      reduceSessionState('running', ev('notification.received', { text: 'idle', kind: 'idle' })),
    ).toBe('awaiting_input');
  });

  it('running + notification.received(other) → running', () => {
    expect(
      reduceSessionState('running', ev('notification.received', { text: 'hi', kind: 'other' })),
    ).toBe('running');
  });

  it('session.state_changed jumps directly to "to"', () => {
    expect(
      reduceSessionState(
        'running',
        ev('session.state_changed', { from: 'running', to: 'awaiting_input' }),
      ),
    ).toBe('awaiting_input');
  });

  it('unknown + assistant.turn_completed → running', () => {
    expect(
      reduceSessionState(
        'unknown',
        ev('assistant.turn_completed', {
          model: 'claude-opus-4-7',
          usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
        }),
      ),
    ).toBe('running');
  });
});
