import { createServer, type Server, type Socket } from 'node:net';
import { chmod, unlink } from 'node:fs/promises';
import readline from 'node:readline';
import {
  countEventsSince,
  listSessions,
  type DbHandle,
} from '@repo-orch/core';
import type { EventBus } from '../event-bus.js';
import {
  matchesFilter,
  type ClientMessage,
  type ServerMessage,
  type SubscribeFilter,
} from './protocol.js';

export type SocketServer = {
  close(): Promise<void>;
};

export type StartSocketServerOptions = {
  socketPath: string;
  db: DbHandle;
  bus: EventBus;
};

function writeLine(socket: Socket, msg: ServerMessage): boolean {
  return socket.write(JSON.stringify(msg) + '\n');
}

export async function startSocketServer(opts: StartSocketServerOptions): Promise<SocketServer> {
  await unlink(opts.socketPath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });

  const activeSockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    let unsubscribe: (() => void) | null = null;
    let closed = false;
    activeSockets.add(socket);

    const cleanup = (): void => {
      closed = true;
      activeSockets.delete(socket);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (closed) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(line) as ClientMessage;
      } catch {
        writeLine(socket, { error: 'invalid_json' });
        return;
      }
      handle(msg);
    });

    function handle(msg: ClientMessage): void {
      switch (msg.op) {
        case 'ping':
          writeLine(socket, { pong: true });
          return;
        case 'status':
          writeLine(socket, { sessions: listSessions(opts.db) });
          return;
        case 'health': {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          writeLine(socket, {
            health: {
              eventsLast24h: countEventsSince(opts.db, since),
              sessions: listSessions(opts.db).length,
            },
          });
          return;
        }
        case 'subscribe': {
          if (unsubscribe) {
            writeLine(socket, { error: 'already_subscribed' });
            return;
          }
          const filter: SubscribeFilter | undefined = msg.filter;
          writeLine(socket, { ok: true });
          unsubscribe = opts.bus.subscribe((event) => {
            if (!matchesFilter(event, filter)) return;
            const ok = writeLine(socket, { event });
            if (!ok) {
              // Backpressure: client cannot keep up; drop events for this client.
            }
          });
          return;
        }
        default:
          writeLine(socket, { error: 'unknown_op' });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });

  await chmod(opts.socketPath, 0o600).catch(() => undefined);

  return {
    async close() {
      for (const sock of activeSockets) sock.destroy();
      activeSockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlink(opts.socketPath).catch(() => undefined);
    },
  };
}
