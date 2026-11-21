export interface AssignmentResult {
  conversationId: string;
  assigneeUserId: string | null;
  handler: 'ai' | 'human';
  version: number;
}
