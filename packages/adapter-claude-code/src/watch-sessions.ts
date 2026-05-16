import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

export type SessionsStatus = {
  pid: number;
  sessionId?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
  status?: 'busy' | 'idle';
};

export type SessionsWatcherEvents = {
  status: (s: SessionsStatus) => void;
  error: (err: Error) => void;
};

export interface SessionsWatcher {
  on<E extends keyof SessionsWatcherEvents>(e: E, fn: SessionsWatcherEvents[E]): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createSessionsWatcher(dir: string): SessionsWatcher {
  const emitter = new EventEmitter();
  let watcher: FSWatcher | null = null;

  async function handle(p: string): Promise<void> {
    if (!p.endsWith('.json')) return;
    try {
      const raw = await readFile(p, 'utf8');
      const parsed = JSON.parse(raw) as SessionsStatus;
      emitter.emit('status', parsed);
    } catch (err) {
      emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  return {
    on(event, fn) {
      emitter.on(event, fn as (...args: unknown[]) => void);
    },
    async start() {
      watcher = chokidar.watch(dir, {
        depth: 0,
        ignoreInitial: false,
        persistent: true,
      });
      watcher.on('add', (p) => void handle(p));
      watcher.on('change', (p) => void handle(p));
      watcher.on('error', (err) =>
        emitter.emit('error', err instanceof Error ? err : new Error(String(err))),
      );
      await new Promise<void>((resolve) => watcher!.once('ready', resolve));
    },
    async stop() {
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
    },
  };
}
