import type { MessagePart } from '@nless/shared/core/types';
import type { ChatAttachmentRef, ConversationRecord } from '@nless/shared/features/inbox/types';
import { AppError, db, sendToCustomer, storage } from '../../core';
import { assignConversation } from '../team/service';
import { messagePartsSchema } from './schemas';
import { readConversation } from './setup';

export type StaffMessageInput = {
  businessId: string;
  conversationId: string;
  actorUserId: string;
  clientRequestId: string;
  text?: string;
  attachments?: ChatAttachmentRef[];
  parts?: MessagePart[];
  autoTakeover?: boolean;
};

export async function activeHolder(conversation: ConversationRecord) {
  if (conversation.handler !== 'human' || !conversation.assigneeUserId) return null;
  return db.maybeOne<{ userId: string; displayName: string }>(`SELECT u.id AS "userId", u.display_name AS "displayName"
    FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.business_id=$1 AND m.user_id=$2 AND m.status='active' AND u.status='active'`,
    [conversation.businessId, conversation.assigneeUserId]);
}

async function buildStaffParts(input: StaffMessageInput): Promise<MessagePart[]> {
  const parts: MessagePart[] = input.parts ?? [];
  if (!input.parts) {
    const text = input.text?.trim();
    if (text) parts.push({ type: 'text', text });
    for (const attachment of input.attachments ?? []) {
      const stored = await storage.read(attachment.fileId, { businessId: input.businessId });
      if (!stored || !['chat-attachment', 'template-asset'].includes(stored.file.purpose)
        || (attachment.kind === 'image' && !stored.file.mimeType.startsWith('image/'))) {
        throw new AppError('VALIDATION_ERROR', 'Invalid attachment');
      }
      const { id, originalName, mimeType, sizeBytes } = stored.file;
      parts.push(attachment.kind === 'image' ? { type: 'image', fileId: id, alt: originalName }
        : { type: 'file', fileId: id, fileName: originalName, mimeType, sizeBytes });
    }
  }
  const validated = messagePartsSchema.safeParse(parts);
  if (!validated.success || validated.data.some(({ type }) => type === 'order_review' || type === 'booking_review')) {
    throw new AppError('VALIDATION_ERROR', 'Invalid staff message content');
  }
  return validated.data;
}

function takenBy(holder: { userId: string; displayName: string } | null, version: number) {
  return new AppError('VERSION_CONFLICT', 'Conversation changed', {
    details: { reason: 'conversation_taken', holder, currentVersion: version },
  });
}

export async function deliverStaffMessage(input: StaffMessageInput) {
  const { businessId, conversationId, actorUserId, clientRequestId } = input;
  const conversation = await readConversation(db, conversationId, businessId);
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  if (conversation.status === 'closed') throw new AppError('POLICY_BLOCKED', 'Conversation is closed', {
    details: { reason: 'conversation_closed' },
  });
  const parts = await buildStaffParts(input);
  const holder = await activeHolder(conversation);
  if (input.autoTakeover === false && holder?.userId !== actorUserId) {
    throw new AppError('PERMISSION_DENIED', 'Current assignment is required');
  }
  if (input.autoTakeover !== false) {
    if (holder && holder.userId !== actorUserId) throw takenBy(holder, conversation.version);
    if (!holder) {
      try {
        await assignConversation(conversationId, actorUserId, { expectedVersion: conversation.version, actorUserId, businessId });
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'VERSION_CONFLICT') throw error;
        const current = await readConversation(db, conversationId, businessId);
        if (!current) throw new AppError('NOT_FOUND', 'Conversation not found');
        const winner = await activeHolder(current);
        if (winner?.userId !== actorUserId) throw takenBy(winner, current.version);
      }
    }
  }
  return sendToCustomer(conversationId, parts, { author: 'staff', authorUserId: actorUserId, clientRequestId, origin: 'live', businessId });
}
