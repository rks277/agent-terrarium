import { connect, type Socket } from 'node:net';
import readline from 'node:readline';

export type SocketClient = {
  send(op: unknown): void;
  next(): Promise<unknown>;
  close(): void;
};

export function connectSocket(socketPath: string): Promise<SocketClient> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect(socketPath);
    socket.once('connect', () => {
      const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
      const queue: unknown[] = [];
      const waiters: ((v: unknown) => void)[] = [];
      const rejectWaiters: ((err: Error) => void)[] = [];
      let closed = false;

      rl.on('line', (line: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          process.stderr.write(`repo-orch: bad line from daemon: ${line}\n`);
          return;
        }
        const w = waiters.shift();
        rejectWaiters.shift();
        if (w) w(parsed);
        else queue.push(parsed);
      });
      rl.on('close', () => {
        closed = true;
        for (const r of rejectWaiters) r(new Error('socket closed'));
        waiters.length = 0;
      });

      resolve({
        send(op) {
          socket.write(JSON.stringify(op) + '\n');
        },
        next() {
          if (queue.length) return Promise.resolve(queue.shift());
          if (closed) return Promise.reject(new Error('socket closed'));
          return new Promise<unknown>((res, rej) => {
            waiters.push(res);
            rejectWaiters.push(rej);
          });
        },
        close() {
          socket.end();
        },
      });
    });
    socket.once('error', reject);
  });
}
