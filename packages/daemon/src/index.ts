import { mkdir } from 'node:fs/promises';
import { createClaudeCodeAdapter, type Adapter } from '@repo-orch/adapter-claude-code';
import { closeDb, openDb, type DbHandle } from '@repo-orch/core';
import { createEventBus, type EventBus } from './event-bus.js';
import { createIngestPipeline, type IngestPipeline } from './ingest-pipeline.js';
import { startSocketServer, type SocketServer } from './transport/socket-server.js';
import { resolvePaths, type Paths } from './paths.js';
import { backfill } from './backfill.js';

export { resolvePaths } from './paths.js';
export { createEventBus } from './event-bus.js';
export { createIngestPipeline, runIngestPipeline } from './ingest-pipeline.js';
export { dedupeKeyFor } from './dedupe.js';
export { startSocketServer } from './transport/socket-server.js';
export type { ClientMessage, ServerMessage, SubscribeFilter } from './transport/protocol.js';

export type DaemonHandle = {
  paths: Paths;
  db: DbHandle;
  bus: EventBus;
  pipeline: IngestPipeline;
  adapter: Adapter;
  server: SocketServer;
  stop(): Promise<void>;
};

export type StartDaemonOptions = {
  home?: string;
  capturePromptText?: boolean;
};

export async function startDaemon(options: StartDaemonOptions = {}): Promise<DaemonHandle> {
  const paths = resolvePaths(options.home);
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.events, { recursive: true });
  await mkdir(paths.logs, { recursive: true });
  await mkdir(paths.bin, { recursive: true });

  const db = openDb(paths.db);
  const bus = createEventBus();
  const pipeline = createIngestPipeline({ db, bus });

  await backfill(db, pipeline, { projectsDir: paths.claudeProjects });

  const adapter = createClaudeCodeAdapter({
    projectsDir: paths.claudeProjects,
    sessionsDir: paths.claudeSessions,
    maildir: paths.events,
    capturePromptText: options.capturePromptText ?? false,
  });
  adapter.on('event', (event) => pipeline.ingest(event));

  const server = await startSocketServer({ socketPath: paths.socket, db, bus });

  await adapter.start();

  return {
    paths,
    db,
    bus,
    pipeline,
    adapter,
    server,
    async stop() {
      await server.close();
      await adapter.stop();
      closeDb(db);
    },
  };
}
