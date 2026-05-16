import { ulid } from 'ulid';
import {
  getSession,
  insertEvent,
  recordTokenUsage,
  reduceSessionState,
  updateSessionState,
  upsertRepo,
  upsertSession,
  type DbHandle,
  type EventEnvelope,
} from '@repo-orch/core';
import type { Adapter } from '@repo-orch/adapter-claude-code';
import type { EventBus } from './event-bus.js';
import { dedupeKeyFor } from './dedupe.js';

export type IngestPipeline = {
  ingest(event: EventEnvelope): void;
};

export type IngestPipelineOptions = {
  db: DbHandle;
  bus: EventBus;
};

export function createIngestPipeline(opts: IngestPipelineOptions): IngestPipeline {
  const { db, bus } = opts;
  const turnIndexBySession = new Map<string, number>();

  function nextTurnIndex(sessionId: string): number {
    const prev = turnIndexBySession.get(sessionId) ?? -1;
    const next = prev + 1;
    turnIndexBySession.set(sessionId, next);
    return next;
  }

  function persistAndPublish(event: EventEnvelope): void {
    const now = event.ingestedAt || new Date().toISOString();
    upsertRepo(db, event.repoPath, now);

    let session = getSession(db, event.sessionId);
    if (!session) {
      upsertSession(db, {
        sessionId: event.sessionId,
        repoPath: event.repoPath,
        source: event.source,
        state: 'unknown',
        startedAt: event.occurredAt,
        model: event.type === 'session.started' ? event.payload.model ?? null : null,
        pid: event.type === 'session.started' ? event.payload.pid ?? null : null,
      });
      session = getSession(db, event.sessionId);
    }
    const prevState = session?.state ?? 'unknown';

    const inserted = insertEvent(db, event, dedupeKeyFor(event));
    if (!inserted) return;

    bus.publish(event);

    if (event.type === 'assistant.turn_completed') {
      const u = event.payload.usage;
      recordTokenUsage(db, {
        sessionId: event.sessionId,
        turnIndex: nextTurnIndex(event.sessionId),
        model: event.payload.model,
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheCreation: u.cacheCreation,
        occurredAt: event.occurredAt,
      });
    }

    const nextState = reduceSessionState(prevState, event);
    if (nextState !== prevState) {
      const endedAt = nextState === 'ended' ? event.occurredAt : undefined;
      updateSessionState(db, event.sessionId, nextState, endedAt);
      const stateChange: EventEnvelope<'session.state_changed'> = {
        eventId: ulid(),
        type: 'session.state_changed',
        source: event.source,
        sessionId: event.sessionId,
        repoPath: event.repoPath,
        occurredAt: event.occurredAt,
        ingestedAt: now,
        payload: { from: prevState, to: nextState },
      };
      const stateInserted = insertEvent(db, stateChange, dedupeKeyFor(stateChange));
      if (stateInserted) bus.publish(stateChange);
    }
  }

  return { ingest: persistAndPublish };
}

export function runIngestPipeline(opts: IngestPipelineOptions & { adapter: Adapter }): void {
  const pipeline = createIngestPipeline(opts);
  opts.adapter.on('event', (event) => pipeline.ingest(event));
}
