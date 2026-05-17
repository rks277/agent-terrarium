import { ulid } from 'ulid';
import type { EventEnvelope, SessionStateName } from '@repo-orch/core';
import { decodeCwdWithFallback } from './decode-cwd.js';
import path from 'node:path';

type RawHook = {
  session_id?: string;
  sessionId?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  timestamp?: string;
  tool_name?: string;
  tool?: { name?: string };
  message?: string;
  prompt?: string;
  prompt_type?: string;
  notification_type?: string;
  text?: string;
  model?: string;
  pid?: number;
  reason?: string;
};

function pickToolName(raw: RawHook): string {
  return raw.tool_name ?? raw.tool?.name ?? 'unknown';
}

function deriveRepoPath(raw: RawHook): string {
  if (raw.cwd && raw.cwd.startsWith('/')) return raw.cwd;
  if (raw.transcript_path) {
    const dir = path.basename(path.dirname(raw.transcript_path));
    return decodeCwdWithFallback(dir, raw.cwd ?? null);
  }
  return raw.cwd ?? '/';
}

export function parseHookPayload(raw: unknown): EventEnvelope[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const h = raw as RawHook;
  const sessionId = h.session_id ?? h.sessionId;
  if (!sessionId) return [];
  const occurredAt = h.timestamp ?? new Date().toISOString();
  const ingestedAt = new Date().toISOString();
  const repoPath = deriveRepoPath(h);
  const base = {
    source: 'claude-code' as const,
    sessionId,
    repoPath,
    occurredAt,
    ingestedAt,
  };

  switch (h.hook_event_name) {
    case 'SessionStart': {
      const payload: { model?: string; pid?: number } = {};
      if (h.model) payload.model = h.model;
      if (typeof h.pid === 'number') payload.pid = h.pid;
      return [{ ...base, eventId: ulid(), type: 'session.started', payload }];
    }
    case 'SessionEnd': {
      const reason = (h.reason === 'timeout' || h.reason === 'crash') ? h.reason : 'normal';
      return [{ ...base, eventId: ulid(), type: 'session.ended', payload: { reason } }];
    }
    case 'UserPromptSubmit': {
      const text = h.prompt ?? h.text ?? h.message ?? '';
      return [
        {
          ...base,
          eventId: ulid(),
          type: 'prompt.submitted',
          payload: { length: text.length, text },
        },
      ];
    }
    case 'PermissionRequest':
      return [
        {
          ...base,
          eventId: ulid(),
          type: 'permission.requested',
          payload: { toolName: pickToolName(h) },
        },
      ];
    case 'Notification': {
      const text = h.message ?? h.text ?? '';
      const kind = h.notification_type === 'idle' || h.prompt_type === 'idle' ? 'idle' : 'other';
      return [{ ...base, eventId: ulid(), type: 'notification.received', payload: { text, kind } }];
    }
    case 'Stop': {
      const to: SessionStateName = 'awaiting_input';
      const from: SessionStateName = 'running';
      return [{ ...base, eventId: ulid(), type: 'session.state_changed', payload: { from, to } }];
    }
    default:
      return [];
  }
}
