import type { EventEnvelope } from '../schema/events.js';
import { isTerminal, type SessionState } from '../schema/session.js';

export function reduceSessionState(
  current: SessionState,
  event: EventEnvelope,
): SessionState {
  if (isTerminal(current)) return current;

  switch (event.type) {
    case 'session.started':
      return 'running';

    case 'session.ended':
      return 'ended';

    case 'permission.requested':
      return 'awaiting_permission';

    case 'permission.resolved':
      return current === 'awaiting_permission' ? 'running' : current;

    case 'prompt.submitted':
      return current === 'awaiting_input' || current === 'unknown' ? 'running' : current;

    case 'notification.received':
      return event.payload.kind === 'idle' ? 'awaiting_input' : current;

    case 'session.state_changed':
      return event.payload.to;

    case 'tool.used':
    case 'assistant.turn_completed':
      return current === 'unknown' ? 'running' : current;
  }
}
