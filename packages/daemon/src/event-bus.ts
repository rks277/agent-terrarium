import { EventEmitter } from 'node:events';
import type { EventEnvelope } from '@repo-orch/core';

export interface EventBus {
  publish(event: EventEnvelope): void;
  subscribe(fn: (event: EventEnvelope) => void): () => void;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish(event) {
      emitter.emit('event', event);
    },
    subscribe(fn) {
      emitter.on('event', fn);
      return () => emitter.off('event', fn);
    },
  };
}
