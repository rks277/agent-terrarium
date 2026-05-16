import { readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

export type MaildirWatcher = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type MaildirOptions = {
  dir: string;
  onPayload: (payload: unknown) => void;
  onError?: (err: Error) => void;
};

export function createMaildirWatcher(opts: MaildirOptions): MaildirWatcher {
  let watcher: FSWatcher | null = null;

  async function handle(file: string): Promise<void> {
    const name = path.basename(file);
    if (name.startsWith('.')) return;
    if (!file.endsWith('.json')) return;
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      await rename(file, `${file}.bad`).catch(() => undefined);
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    try {
      opts.onPayload(parsed);
    } finally {
      await unlink(file).catch(() => undefined);
    }
  }

  return {
    async start() {
      watcher = chokidar.watch(opts.dir, {
        depth: 0,
        ignoreInitial: false,
        persistent: true,
      });
      watcher.on('add', (p) => void handle(p));
      watcher.on('error', (err) =>
        opts.onError?.(err instanceof Error ? err : new Error(String(err))),
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
