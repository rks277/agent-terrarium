import { ulid } from 'ulid';
import type { EventEnvelope, TokenUsage } from '@repo-orch/core';

export type ParseContext = {
  transcriptPath: string;
  sessionId: string;
  repoPath: string;
  isFirstLine?: boolean;
  capturePromptText?: boolean;
};

type RawLine = {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (isObject(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
        parts.push(block['text'] as string);
      }
    }
    return parts.join('');
  }
  return '';
}

function extractToolUses(content: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isObject(block) && block['type'] === 'tool_use' && typeof block['name'] === 'string') {
        out.push(block['name'] as string);
      }
    }
  }
  return out;
}

function toUsage(u: NonNullable<RawLine['message']>['usage']): TokenUsage {
  return {
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheCreation: u?.cache_creation_input_tokens ?? 0,
  };
}

export function parseTranscriptLine(line: string, ctx: ParseContext): EventEnvelope[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];

  let parsed: RawLine;
  try {
    parsed = JSON.parse(trimmed) as RawLine;
  } catch {
    return [];
  }

  const occurredAt = parsed.timestamp ?? new Date().toISOString();
  const ingestedAt = new Date().toISOString();
  const events: EventEnvelope[] = [];

  const base = {
    source: 'claude-code' as const,
    sessionId: ctx.sessionId,
    repoPath: ctx.repoPath,
    occurredAt,
    ingestedAt,
  };

  if (ctx.isFirstLine) {
    const model = parsed.message?.model;
    events.push({
      ...base,
      eventId: ulid(),
      type: 'session.started',
      payload: model ? { model } : {},
    });
  }

  switch (parsed.type) {
    case 'user': {
      const text = extractText(parsed.message?.content);
      const length = text.length;
      if (length > 0) {
        const payload: { length: number; text?: string } = { length };
        if (ctx.capturePromptText) payload.text = text;
        events.push({
          ...base,
          eventId: ulid(),
          type: 'prompt.submitted',
          payload,
        });
      }
      break;
    }
    case 'assistant': {
      const msg = parsed.message;
      if (msg?.usage) {
        events.push({
          ...base,
          eventId: ulid(),
          type: 'assistant.turn_completed',
          payload: {
            model: msg.model ?? 'unknown',
            usage: toUsage(msg.usage),
          },
        });
      }
      for (const toolName of extractToolUses(msg?.content)) {
        events.push({
          ...base,
          eventId: ulid(),
          type: 'tool.used',
          payload: { toolName },
        });
      }
      break;
    }
    default:
      break;
  }

  return events;
}
