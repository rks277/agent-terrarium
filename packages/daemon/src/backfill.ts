import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';
import type { DbHandle, EventEnvelope } from '@repo-orch/core';
import { decodeCwdWithFallback } from '@repo-orch/adapter-claude-code';
import type { IngestPipeline } from './ingest-pipeline.js';

export type BackfillOptions = {
  projectsDir: string;
  windowMs?: number;
};

type FirstLine = {
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: { model?: string };
};

async function readFirstLine(file: string): Promise<FirstLine | null> {
  try {
    const text = await readFile(file, 'utf8');
    const nl = text.indexOf('\n');
    const first = nl === -1 ? text : text.slice(0, nl);
    if (first.trim().length === 0) return null;
    return JSON.parse(first) as FirstLine;
  } catch {
    return null;
  }
}

export async function backfill(
  db: DbHandle,
  pipeline: IngestPipeline,
  opts: BackfillOptions,
): Promise<void> {
  void db;
  const windowMs = opts.windowMs ?? 30 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  let projectDirs: string[];
  try {
    projectDirs = await readdir(opts.projectsDir);
  } catch {
    return;
  }
  for (const encoded of projectDirs) {
    const dir = path.join(opts.projectsDir, encoded);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const fullPath = path.join(dir, file);
      let mtime: number;
      try {
        const s = await stat(fullPath);
        mtime = s.mtimeMs;
      } catch {
        continue;
      }
      if (mtime < cutoff) continue;

      const first = await readFirstLine(fullPath);
      if (!first) continue;

      const sessionId = first.sessionId ?? path.basename(file, '.jsonl');
      const repoPath = decodeCwdWithFallback(encoded, first.cwd ?? null);
      const occurredAt = first.timestamp ?? new Date(mtime).toISOString();
      const event: EventEnvelope<'session.started'> = {
        eventId: ulid(),
        type: 'session.started',
        source: 'claude-code',
        sessionId,
        repoPath,
        occurredAt,
        ingestedAt: new Date().toISOString(),
        payload: first.message?.model ? { model: first.message.model } : {},
      };
      pipeline.ingest(event);
    }
  }
}
