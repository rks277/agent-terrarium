import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTranscriptLine } from './parse-transcript-line.js';
import type { EventEnvelope } from '@repo-orch/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureLine = path.resolve(here, '../test/fixtures/sample-session.jsonl');
const fixtureExpected = path.resolve(here, '../test/fixtures/expected-events.json');

function stripVolatile(e: EventEnvelope): Omit<EventEnvelope, 'eventId' | 'ingestedAt' | 'source'> {
  const { eventId, ingestedAt, source, ...rest } = e;
  void eventId;
  void ingestedAt;
  void source;
  return rest;
}

describe('replay: fixture JSONL produces expected event stream', () => {
  it('matches expected events', async () => {
    const text = await readFile(fixtureLine, 'utf8');
    const expected = JSON.parse(await readFile(fixtureExpected, 'utf8'));
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const events: EventEnvelope[] = [];
    lines.forEach((line, idx) => {
      const out = parseTranscriptLine(line, {
        transcriptPath: fixtureLine,
        sessionId: 'sess-fixture-1',
        repoPath: '/repo/fixture',
        isFirstLine: idx === 0,
        capturePromptText: false,
      });
      events.push(...out);
    });
    expect(events.map(stripVolatile)).toEqual(expected);
  });
});
