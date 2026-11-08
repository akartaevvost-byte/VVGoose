import type { SessionListItem } from '../acp/sessions';

export type SessionListChange =
  | { kind: 'archived'; sessionId: string; session?: SessionListItem }
  | { kind: 'unarchived'; sessionId: string; session?: SessionListItem }
  | { kind: 'deleted'; sessionId: string };
