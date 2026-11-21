export interface AssignmentResult {
  conversationId: string;
  assigneeUserId: string | null;
  handler: 'ai' | 'human';
  version: number;
}

export type EffectiveAvailability = 'available' | 'away' | 'off_shift';

export interface ConversationTeamState extends AssignmentResult {
  assigneeName: string | null;
  status: 'open' | 'closed';
  isQueued: boolean;
  canTakeover: boolean;
  candidates: { userId: string; displayName: string; availability: EffectiveAvailability; openCount: number }[];
}
