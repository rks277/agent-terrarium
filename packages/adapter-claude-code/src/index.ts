import { EventEmitter } from 'node:events';
import type { AdapterSource, EventEnvelope } from '@repo-orch/core';
import { createProjectsWatcher, type ProjectsWatcher } from './watch-projects.js';
import { createSessionsWatcher, type SessionsWatcher } from './watch-sessions.js';
import { createMaildirWatcher, type MaildirWatcher } from './watch-maildir.js';
import { parseHookPayload } from './parse-hook-payload.js';

export type AdapterEvents = {
  event: (event: EventEnvelope) => void;
  error: (err: Error) => void;
};

export interface Adapter {
  readonly source: AdapterSource;
  start(): Promise<void>;
  stop(): Promise<void>;
  on<E extends keyof AdapterEvents>(e: E, fn: AdapterEvents[E]): void;
}

export type CreateClaudeCodeAdapterOptions = {
  projectsDir: string;
  sessionsDir: string;
  maildir: string;
  capturePromptText?: boolean;
};

export function createClaudeCodeAdapter(opts: CreateClaudeCodeAdapterOptions): Adapter {
  const emitter = new EventEmitter();
  const projects: ProjectsWatcher = createProjectsWatcher({
    projectsDir: opts.projectsDir,
    capturePromptText: opts.capturePromptText ?? false,
  });
  const sessions: SessionsWatcher = createSessionsWatcher(opts.sessionsDir);
  const maildir: MaildirWatcher = createMaildirWatcher({
    dir: opts.maildir,
    onPayload: (raw) => {
      for (const event of parseHookPayload(raw)) {
        emitter.emit('event', event);
      }
    },
    onError: (err) => emitter.emit('error', err),
  });

  projects.on('event', (e) => emitter.emit('event', e));
  projects.on('error', (err) => emitter.emit('error', err));
  sessions.on('error', (err) => emitter.emit('error', err));

  return {
    source: 'claude-code',
    async start() {
      await projects.start();
      await sessions.start();
      await maildir.start();
    },
    async stop() {
      await projects.stop();
      await sessions.stop();
      await maildir.stop();
    },
    on(event, fn) {
      emitter.on(event, fn as (...args: unknown[]) => void);
    },
  };
}

export { decodeCwd, decodeCwdWithFallback } from './decode-cwd.js';
export { parseTranscriptLine } from './parse-transcript-line.js';
export type { ParseContext } from './parse-transcript-line.js';
export { createProjectsWatcher } from './watch-projects.js';
export { createSessionsWatcher } from './watch-sessions.js';
export { createMaildirWatcher } from './watch-maildir.js';
export { parseHookPayload } from './parse-hook-payload.js';
