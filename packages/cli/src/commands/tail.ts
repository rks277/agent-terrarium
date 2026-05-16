import type { EventEnvelope } from '@repo-orch/core';
import { resolvePaths } from '@repo-orch/daemon';
import { connectSocket } from '../socket-client.js';
import { prettyEvent } from '../format.js';

export type TailOptions = {
  session?: string;
  type?: string;
  repo?: string;
  pretty?: boolean;
  home?: string;
  signal?: AbortSignal;
};

export async function runTail(opts: TailOptions = {}): Promise<void> {
  const paths = resolvePaths(opts.home);
  const client = await connectSocket(paths.socket);
  const filter: { sessionId?: string; type?: string; repoPath?: string } = {};
  if (opts.session) filter.sessionId = opts.session;
  if (opts.type) filter.type = opts.type;
  if (opts.repo) filter.repoPath = opts.repo;

  client.send({ op: 'subscribe', filter });
  const ack = (await client.next()) as { ok?: true; error?: string };
  if (!ack.ok) {
    throw new Error(`daemon error: ${ack.error ?? 'unknown'}`);
  }

  const abort = () => client.close();
  opts.signal?.addEventListener('abort', abort);

  try {
    while (!opts.signal?.aborted) {
      const msg = (await client.next()) as { event?: EventEnvelope };
      if (!msg.event) continue;
      const line = opts.pretty ? prettyEvent(msg.event) : JSON.stringify(msg.event);
      process.stdout.write(line + '\n');
    }
  } catch (err) {
    if (!opts.signal?.aborted) throw err;
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    client.close();
  }
}
