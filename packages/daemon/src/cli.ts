#!/usr/bin/env node
import { startDaemon } from './index.js';

async function main(): Promise<void> {
  const handle = await startDaemon();
  process.stderr.write(`repo-orch daemon ready at ${handle.paths.socket}\n`);

  const shutdown = async () => {
    try {
      await handle.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main().catch((err) => {
  process.stderr.write(`daemon failed: ${String(err)}\n`);
  process.exit(1);
});
