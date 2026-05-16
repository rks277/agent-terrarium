import { describe, it, expect } from 'vitest';
import { parseTranscriptLine } from './parse-transcript-line.js';

const ctx = {
  transcriptPath: '/tmp/t.jsonl',
  sessionId: 'sess-1',
  repoPath: '/repo/a',
};

describe('parseTranscriptLine', () => {
  it('returns [] for an empty line', () => {
    expect(parseTranscriptLine('', ctx)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseTranscriptLine('not json', ctx)).toEqual([]);
  });

  it('returns [] for an unknown type', () => {
    const line = JSON.stringify({ type: 'unknown', timestamp: '2026-05-16T00:00:00Z' });
    expect(parseTranscriptLine(line, ctx)).toEqual([]);
  });

  it('parses a user prompt into prompt.submitted with length only by default', () => {
    const line = JSON.stringify({
      type: 'user',
      timestamp: '2026-05-16T00:00:01Z',
      message: { role: 'user', content: 'Hello world' },
    });
    const events = parseTranscriptLine(line, ctx);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('prompt.submitted');
    if (events[0]?.type === 'prompt.submitted') {
      expect(events[0].payload.length).toBe(11);
      expect(events[0].payload.text).toBeUndefined();
    }
  });

  it('includes text when capturePromptText=true', () => {
    const line = JSON.stringify({
      type: 'user',
      timestamp: '2026-05-16T00:00:01Z',
      message: { role: 'user', content: 'Hello' },
    });
    const events = parseTranscriptLine(line, { ...ctx, capturePromptText: true });
    if (events[0]?.type === 'prompt.submitted') {
      expect(events[0].payload.text).toBe('Hello');
    }
  });

  it('parses an assistant turn with usage into assistant.turn_completed', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-16T00:00:02Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-7',
        content: [{ type: 'text', text: 'OK' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
      },
    });
    const events = parseTranscriptLine(line, ctx);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('assistant.turn_completed');
    if (events[0]?.type === 'assistant.turn_completed') {
      expect(events[0].payload.model).toBe('claude-opus-4-7');
      expect(events[0].payload.usage).toEqual({
        input: 100,
        output: 50,
        cacheRead: 10,
        cacheCreation: 5,
      });
    }
  });

  it('emits a tool.used event for each tool_use content block', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-16T00:00:03Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-7',
        content: [
          { type: 'tool_use', name: 'Read', id: 't1', input: {} },
          { type: 'tool_use', name: 'Bash', id: 't2', input: {} },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const events = parseTranscriptLine(line, ctx);
    const toolUses = events.filter(e => e.type === 'tool.used');
    expect(toolUses.map(e => (e.type === 'tool.used' ? e.payload.toolName : null))).toEqual([
      'Read',
      'Bash',
    ]);
  });

  it('synthesizes session.started on first line', () => {
    const line = JSON.stringify({
      type: 'user',
      timestamp: '2026-05-16T00:00:00Z',
      message: { role: 'user', content: 'hi' },
    });
    const events = parseTranscriptLine(line, { ...ctx, isFirstLine: true });
    expect(events[0]?.type).toBe('session.started');
  });
});
