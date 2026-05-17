import { describe, it, expect } from 'vitest';
import { parseHookPayload } from './parse-hook-payload.js';

describe('parseHookPayload', () => {
  it('SessionStart → session.started', () => {
    const events = parseHookPayload({
      session_id: 's1',
      cwd: '/repo/a',
      hook_event_name: 'SessionStart',
      timestamp: '2026-05-16T00:00:00Z',
      model: 'claude-opus-4-7',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('session.started');
    if (events[0]?.type === 'session.started') {
      expect(events[0].payload.model).toBe('claude-opus-4-7');
    }
  });

  it('PermissionRequest → permission.requested with toolName', () => {
    const events = parseHookPayload({
      session_id: 's2',
      cwd: '/repo/a',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('permission.requested');
    if (events[0]?.type === 'permission.requested') {
      expect(events[0].payload.toolName).toBe('Bash');
    }
  });

  it('Notification idle → kind=idle', () => {
    const events = parseHookPayload({
      session_id: 's3',
      cwd: '/repo/a',
      hook_event_name: 'Notification',
      message: 'are you there?',
      notification_type: 'idle',
    });
    expect(events[0]?.type).toBe('notification.received');
    if (events[0]?.type === 'notification.received') {
      expect(events[0].payload.kind).toBe('idle');
      expect(events[0].payload.text).toBe('are you there?');
    }
  });

  it('SessionEnd → session.ended with default reason normal', () => {
    const events = parseHookPayload({
      session_id: 's4',
      cwd: '/repo/a',
      hook_event_name: 'SessionEnd',
    });
    expect(events[0]?.type).toBe('session.ended');
    if (events[0]?.type === 'session.ended') {
      expect(events[0].payload.reason).toBe('normal');
    }
  });

  it('UserPromptSubmit → prompt.submitted with length and text', () => {
    const events = parseHookPayload({
      session_id: 's-prompt',
      cwd: '/repo/a',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hello world',
    });
    expect(events[0]?.type).toBe('prompt.submitted');
    if (events[0]?.type === 'prompt.submitted') {
      expect(events[0].payload.length).toBe(11);
      expect(events[0].payload.text).toBe('hello world');
    }
  });

  it('UserPromptSubmit with no prompt body → length 0', () => {
    const events = parseHookPayload({
      session_id: 's-prompt2',
      cwd: '/repo/a',
      hook_event_name: 'UserPromptSubmit',
    });
    expect(events[0]?.type).toBe('prompt.submitted');
    if (events[0]?.type === 'prompt.submitted') {
      expect(events[0].payload.length).toBe(0);
    }
  });

  it('Stop → session.state_changed running→awaiting_input', () => {
    const events = parseHookPayload({
      session_id: 's5',
      cwd: '/repo/a',
      hook_event_name: 'Stop',
    });
    expect(events[0]?.type).toBe('session.state_changed');
    if (events[0]?.type === 'session.state_changed') {
      expect(events[0].payload.to).toBe('awaiting_input');
    }
  });

  it('returns [] for unknown event name', () => {
    expect(parseHookPayload({ session_id: 's', hook_event_name: 'WhoKnows' })).toEqual([]);
  });

  it('returns [] when session_id is missing', () => {
    expect(parseHookPayload({ hook_event_name: 'SessionStart' })).toEqual([]);
  });
});
