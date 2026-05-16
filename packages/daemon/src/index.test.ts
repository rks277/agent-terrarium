import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect } from 'node:net';
import readline from 'node:readline';
import { startDaemon, type DaemonHandle } from './index.js';

let tempHome: string;
let daemon: DaemonHandle;

beforeEach(async () => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'daemon-boot-'));
  daemon = await startDaemon({ home: tempHome });
});

afterEach(async () => {
  await daemon.stop();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('daemon boot smoke test', () => {
  it('creates the socket and responds to ping', async () => {
    expect(existsSync(daemon.paths.socket)).toBe(true);

    await new Promise<void>((resolve, reject) => {
      const sock = connect(daemon.paths.socket);
      const rl = readline.createInterface({ input: sock, crlfDelay: Infinity });
      sock.once('connect', () => {
        sock.write(JSON.stringify({ op: 'ping' }) + '\n');
      });
      rl.once('line', (line) => {
        try {
          expect(JSON.parse(line)).toEqual({ pong: true });
          sock.end();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      sock.once('error', reject);
    });
  });
});
