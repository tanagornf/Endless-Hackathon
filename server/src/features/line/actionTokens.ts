import { createHmac } from 'node:crypto';
import { AppError, config, db, decryptSecret, encryptSecret, type OutboundDelivery } from '../../core';

type ActionDelivery = Pick<OutboundDelivery, 'businessId' | 'conversationId' | 'messageId'>;

export interface LineActionInput {
  kind: 'order' | 'booking';
  proposalId: string;
  version: number;
  decision: 'confirm' | 'cancel';
  reviewToken: string;
  expiresAt: string;
}

export async function mintLineAction(delivery: ActionDelivery, action: LineActionInput): Promise<string> {
  const expiry = new Date(action.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || !Number.isInteger(action.version) || action.version < 1 ||
      !action.proposalId || !action.reviewToken) {
    throw new AppError('VALIDATION_ERROR', 'Invalid LINE confirmation action');
  }

  const { businessId, conversationId, messageId } = delivery;
  const material = JSON.stringify([
    businessId, conversationId, messageId, action.kind, action.proposalId, action.version,
    action.decision, expiry.toISOString(), action.reviewToken,
  ]);
  const digest = createHmac('sha256', config.SESSION_SECRET).update('line-action:v1:').update(material).digest();
  const id = (digest.readBigUInt64BE() % (36n ** 12n)).toString(36).padStart(12, '0');
  const encrypted = encryptSecret(action.reviewToken);

  // A retry gets the same action even if the proposed item has expired in the meantime.
  // The inbound confirmation checks its original expiration and the caller's conversation ownership.
  const stored = await db.maybeOne<{ id: string; review_token_enc: string }>(
    "INSERT INTO line_actions (id, business_id, conversation_id, kind, proposal_id, version, decision, review_token_enc, expires_at) " +
      "SELECT $1, c.business_id, c.id, $5, $6, $7, $8, $9, $10 FROM conversations c " +
      "JOIN messages m ON m.id = $4 AND m.business_id = c.business_id AND m.conversation_id = c.id " +
      "WHERE c.business_id = $2 AND c.id = $3 AND c.channel = 'line' AND m.direction = 'outbound' " +
      "ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id WHERE line_actions.business_id = EXCLUDED.business_id " +
      "AND line_actions.conversation_id = EXCLUDED.conversation_id AND line_actions.kind = EXCLUDED.kind " +
      "AND line_actions.proposal_id = EXCLUDED.proposal_id AND line_actions.version = EXCLUDED.version " +
      "AND line_actions.decision = EXCLUDED.decision AND line_actions.expires_at = EXCLUDED.expires_at RETURNING id, review_token_enc",
    [id, businessId, conversationId, messageId, action.kind, action.proposalId, action.version, action.decision, encrypted, expiry],
  );
  if (!stored || (stored.review_token_enc !== encrypted && decryptSecret(stored.review_token_enc) !== action.reviewToken)) {
    throw new AppError('POLICY_BLOCKED', 'Could not bind LINE confirmation to the outbound message');
  }
  return 'nl:a:' + stored.id;
}
