import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect, type Socket } from 'node:net';
import readline from 'node:readline';
import { openDb, closeDb, type DbHandle } from '@repo-orch/core';
import { createEventBus, type EventBus } from '../event-bus.js';
import { startSocketServer, type SocketServer } from './socket-server.js';
import type { EventEnvelope } from '@repo-orch/core';

let tempDir: string;
let dbHandle: DbHandle;
let bus: EventBus;
let server: SocketServer;
let socketPath: string;

beforeEach(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'sock-test-'));
  dbHandle = openDb(path.join(tempDir, 'state.db'));
  bus = createEventBus();
  socketPath = path.join(tempDir, 'daemon.sock');
  server = await startSocketServer({ socketPath, db: dbHandle, bus });
});

afterEach(async () => {
  await server.close();
  closeDb(dbHandle);
  rmSync(tempDir, { recursive: true, force: true });
});

function connectClient(): Promise<{ socket: Socket; next: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once('connect', () => {
      const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
      const queue: string[] = [];
      const waiters: ((v: string) => void)[] = [];
      let closed = false;
      const rejectWaiters: ((err: Error) => void)[] = [];
      rl.on('line', (line: string) => {
        const w = waiters.shift();
        rejectWaiters.shift();
        if (w) w(line);
        else queue.push(line);
      });
      rl.on('close', () => {
        closed = true;
        for (const r of rejectWaiters) r(new Error('socket closed'));
        waiters.length = 0;
      });
      function next(): Promise<string> {
        if (queue.length) return Promise.resolve(queue.shift()!);
        if (closed) return Promise.reject(new Error('socket closed'));
        return new Promise<string>((res, rej) => {
          waiters.push(res);
          rejectWaiters.push(rej);
        });
      }
      resolve({ socket, next });
    });
    socket.once('error', reject);
  });
}

describe('socket server', () => {
  it('responds to ping', async () => {
    const { socket, next } = await connectClient();
    socket.write(JSON.stringify({ op: 'ping' }) + '\n');
    const line = await next();
    expect(JSON.parse(line)).toEqual({ pong: true });
    socket.end();
  });

  it('streams events to a subscriber', async () => {
    const { socket, next } = await connectClient();
    socket.write(JSON.stringify({ op: 'subscribe' }) + '\n');
    const ack = await next();
    expect(JSON.parse(ack)).toEqual({ ok: true });

    const event: EventEnvelope = {
      eventId: 'e1',
      type: 'tool.used',
      source: 'claude-code',
      sessionId: 's1',
      repoPath: '/r',
      occurredAt: '2026-05-16T00:00:00Z',
      ingestedAt: '2026-05-16T00:00:00Z',
      payload: { toolName: 'Read' },
    };
    bus.publish(event);

    const streamed = await next();
    const parsed = JSON.parse(streamed) as { event: EventEnvelope };
    expect(parsed.event.eventId).toBe('e1');
    expect(parsed.event.type).toBe('tool.used');
    socket.end();
  });

  it('respects subscribe filter', async () => {
    const { socket, next } = await connectClient();
    socket.write(JSON.stringify({ op: 'subscribe', filter: { type: 'session.*' } }) + '\n');
    const ack = await next();
    expect(JSON.parse(ack)).toEqual({ ok: true });

    bus.publish({
      eventId: 'a',
      type: 'tool.used',
      source: 'claude-code',
      sessionId: 's',
      repoPath: '/r',
      occurredAt: '2026-05-16T00:00:00Z',
      ingestedAt: '2026-05-16T00:00:00Z',
      payload: { toolName: 'X' },
    });
    bus.publish({
      eventId: 'b',
      type: 'session.started',
      source: 'claude-code',
      sessionId: 's',
      repoPath: '/r',
      occurredAt: '2026-05-16T00:00:00Z',
      ingestedAt: '2026-05-16T00:00:00Z',
      payload: {},
    });

    const line = await next();
    expect(JSON.parse(line).event.type).toBe('session.started');
    socket.end();
  });

  it('returns status (empty sessions list initially)', async () => {
    const { socket, next } = await connectClient();
    socket.write(JSON.stringify({ op: 'status' }) + '\n');
    const line = await next();
    const parsed = JSON.parse(line) as { sessions: unknown[] };
    expect(parsed.sessions).toEqual([]);
    socket.end();
  });

  it('close() resolves promptly even with a subscribed client still connected (issue 001)', async () => {
    const { socket, next } = await connectClient();
    socket.write(JSON.stringify({ op: 'subscribe' }) + '\n');
    const ack = await next();
    expect(JSON.parse(ack)).toEqual({ ok: true });

    const start = Date.now();
    await Promise.race([
      server.close(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('close() hung — issue 001 regressed')), 2000),
      ),
    ]);
    expect(Date.now() - start).toBeLessThan(2000);
    socket.destroy();
  });
});
