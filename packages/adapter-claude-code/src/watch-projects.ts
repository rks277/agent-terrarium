import { EventEmitter } from 'node:events';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { EventEnvelope } from '@repo-orch/core';
import { decodeCwdWithFallback } from './decode-cwd.js';
import { parseTranscriptLine } from './parse-transcript-line.js';

type FileState = {
  offset: number;
  observed: boolean;
  sessionId: string;
  repoPath: string;
};

export type WatchProjectsOptions = {
  projectsDir: string;
  capturePromptText?: boolean;
};

export type ProjectsWatcherEvents = {
  event: (event: EventEnvelope) => void;
  error: (err: Error) => void;
};

export interface ProjectsWatcher {
  on<E extends keyof ProjectsWatcherEvents>(e: E, fn: ProjectsWatcherEvents[E]): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function sessionIdFromFile(file: string): string {
  return path.basename(file, '.jsonl');
}

export function createProjectsWatcher(opts: WatchProjectsOptions): ProjectsWatcher {
  const emitter = new EventEmitter();
  const files = new Map<string, FileState>();
  let watcher: FSWatcher | null = null;

  function emit(envelope: EventEnvelope): void {
    emitter.emit('event', envelope);
  }

  async function readNew(filePath: string, state: FileState): Promise<void> {
    let size: number;
    try {
      const s = await stat(filePath);
      size = s.size;
    } catch {
      return;
    }
    if (size < state.offset) {
      // Truncation — reset and re-read from start.
      state.offset = 0;
    }
    if (size <= state.offset) return;

    const stream = createReadStream(filePath, {
      start: state.offset,
      end: size - 1,
      encoding: 'utf8',
    });

    const startingOffset = state.offset;
    state.offset = size;

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let consumed = startingOffset;
    let firstObservation = !state.observed;
    state.observed = true;

    for await (const rawLine of rl) {
      const lineBytes = Buffer.byteLength(rawLine, 'utf8') + 1;
      consumed += lineBytes;
      const events = parseTranscriptLine(rawLine, {
        transcriptPath: filePath,
        sessionId: state.sessionId,
        repoPath: state.repoPath,
        isFirstLine: firstObservation,
        capturePromptText: opts.capturePromptText ?? false,
      });
      firstObservation = false;
      for (const e of events) emit(e);
    }
    state.offset = Math.min(consumed, size);
  }

  function ensureState(filePath: string): FileState {
    const existing = files.get(filePath);
    if (existing) return existing;
    const encodedDir = path.basename(path.dirname(filePath));
    const repoPath = decodeCwdWithFallback(encodedDir, null);
    const state: FileState = {
      offset: 0,
      observed: false,
      sessionId: sessionIdFromFile(filePath),
      repoPath,
    };
    files.set(filePath, state);
    return state;
  }

  async function handle(filePath: string): Promise<void> {
    if (!filePath.endsWith('.jsonl')) return;
    const state = ensureState(filePath);
    try {
      await readNew(filePath, state);
    } catch (err) {
      emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  return {
    on(event, fn) {
      emitter.on(event, fn as (...args: unknown[]) => void);
    },
    async start() {
      watcher = chokidar.watch(opts.projectsDir, {
        depth: 2,
        ignoreInitial: false,
        awaitWriteFinish: false,
        persistent: true,
      });
      watcher.on('add', (p) => {
        void handle(p);
      });
      watcher.on('change', (p) => {
        void handle(p);
      });
      watcher.on('error', (err) => {
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
      await new Promise<void>((resolve) => watcher!.once('ready', resolve));
    },
    async stop() {
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
      files.clear();
    },
  };
}
