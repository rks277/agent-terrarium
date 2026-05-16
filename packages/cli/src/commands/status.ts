import type { SessionRow } from '@repo-orch/core';
import { resolvePaths } from '@repo-orch/daemon';
import { connectSocket } from '../socket-client.js';
import { renderSessionsTable } from '../format.js';

export type StatusOptions = { home?: string };

export async function runStatus(opts: StatusOptions = {}): Promise<void> {
  const paths = resolvePaths(opts.home);
  let client;
  try {
    client = await connectSocket(paths.socket);
  } catch (err) {
    process.stderr.write(
      `repo-orch: cannot connect to daemon at ${paths.socket} — is it running? (${String(err)})\n`,
    );
    process.exitCode = 1;
    return;
  }
  client.send({ op: 'status' });
  const msg = (await client.next()) as { sessions?: SessionRow[]; error?: string };
  client.close();
  if (msg.error) {
    process.stderr.write(`repo-orch: ${msg.error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(renderSessionsTable(msg.sessions ?? []) + '\n');
}
