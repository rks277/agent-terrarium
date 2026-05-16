export type EventType =
  | 'session.started'
  | 'session.ended'
  | 'session.state_changed'
  | 'prompt.submitted'
  | 'assistant.turn_completed'
  | 'tool.used'
  | 'permission.requested'
  | 'permission.resolved'
  | 'notification.received';

export type AdapterSource = 'claude-code';

export type SessionStateName =
  | 'unknown'
  | 'running'
  | 'awaiting_input'
  | 'awaiting_permission'
  | 'ended';

export type SessionEndReason = 'normal' | 'timeout' | 'crash';

export type NotificationKind = 'idle' | 'other';

export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
};

export type PayloadMap = {
  'session.started': {
    model?: string;
    gitBranch?: string;
    pid?: number;
  };
  'session.ended': {
    reason: SessionEndReason;
  };
  'session.state_changed': {
    from: SessionStateName;
    to: SessionStateName;
  };
  'prompt.submitted': {
    length: number;
    text?: string;
  };
  'assistant.turn_completed': {
    model: string;
    usage: TokenUsage;
  };
  'tool.used': {
    toolName: string;
  };
  'permission.requested': {
    toolName: string;
  };
  'permission.resolved': {
    toolName: string;
    allowed: boolean;
  };
  'notification.received': {
    text: string;
    kind?: NotificationKind;
  };
};

export type PayloadFor<T extends EventType> = PayloadMap[T];

type EnvelopeBase<T extends EventType> = {
  eventId: string;
  type: T;
  source: AdapterSource;
  sessionId: string;
  repoPath: string;
  occurredAt: string;
  ingestedAt: string;
  payload: PayloadFor<T>;
};

export type EventEnvelope<T extends EventType = EventType> =
  T extends EventType ? EnvelopeBase<T> : never;
