import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createMaildirWatcher, type MaildirWatcher } from './watch-maildir.js';

let dir: string;
let watcher: MaildirWatcher;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'maildir-test-'));
});

afterEach(async () => {
  if (watcher) await watcher.stop();
  rmSync(dir, { recursive: true, force: true });
});

function waitFor<T>(fn: () => T | undefined, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('maildir watcher', () => {
  it('reads, parses, and deletes a payload file', async () => {
    const received: unknown[] = [];
    watcher = createMaildirWatcher({ dir, onPayload: (p) => received.push(p) });
    await watcher.start();

    const file = path.join(dir, 'evt-1.json');
    writeFileSync(file, JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's1' }));

    const got = await waitFor(() => (received[0] as { session_id?: string } | undefined));
    expect(got?.session_id).toBe('s1');
    await waitFor(() => (!existsSync(file) ? true : undefined));
  });

  it('ignores dotfiles until renamed', async () => {
    const received: unknown[] = [];
    watcher = createMaildirWatcher({ dir, onPayload: (p) => received.push(p) });
    await watcher.start();

    const tmpFile = path.join(dir, '.evt-2.json');
    const finalFile = path.join(dir, 'evt-2.json');
    writeFileSync(tmpFile, JSON.stringify({ hook_event_name: 'Stop', session_id: 's2' }));
    await new Promise((r) => setTimeout(r, 80));
    expect(received).toHaveLength(0);

    renameSync(tmpFile, finalFile);
    const got = await waitFor(() => (received[0] as { session_id?: string } | undefined));
    expect(got?.session_id).toBe('s2');
  });

  it('quarantines malformed JSON as .bad and reports error', async () => {
    const errors: Error[] = [];
    watcher = createMaildirWatcher({ dir, onPayload: () => {}, onError: (e) => errors.push(e) });
    await watcher.start();

    const file = path.join(dir, 'evt-3.json');
    writeFileSync(file, 'not json');
    await waitFor(() => (existsSync(file + '.bad') ? true : undefined));
    expect(errors.length).toBeGreaterThan(0);
  });
});
