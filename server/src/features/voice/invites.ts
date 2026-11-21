import { createHash, randomBytes } from 'node:crypto';
import { AppError, config, db } from '../../core';
import { getConversation } from '../inbox/service';

export interface VerifiedLineSender {
  businessId: string;
  lineUser: string;
  lineBot: string;
}

export interface CreateVoiceInviteInput extends VerifiedLineSender {
  conversationId: string;
  eventId: string;
  language: 'th' | 'en';
  basicId?: string | null;
}

export const voiceCommandPrefix = 'ENDLESS-VOICE:';
export const digest = (secret: string) => createHash('sha256').update(secret).digest('hex');
export const validProof = (proof?: string) => Boolean(proof && /^[A-Za-z0-9_-]{43}$/.test(proof));

export interface InviteScope {
  id: string;
  business_id: string;
  conversation_id: string;
  customer_id: string;
  line_user: string;
  line_bot: string;
  language: 'th' | 'en';
}

export async function createVoiceInvite(input: CreateVoiceInviteInput) {
  const base = config.PUBLIC_BASE_URL;
  if (!base || new URL(base).protocol !== 'https:') throw new AppError('PROVIDER_UNAVAILABLE', 'Voice needs a public HTTPS URL');
  const conversation = await getConversation(input.conversationId, { businessId: input.businessId });
  if (!conversation || conversation.channel !== 'line' || conversation.status !== 'open' ||
      conversation.customer.externalId !== input.lineUser || conversation.customer.channelAccountId !== input.lineBot) {
    throw new AppError('NOT_FOUND');
  }
  const invite = await db.one<{ id: string; expires_at: Date }>(`
    INSERT INTO voice_invites (business_id, conversation_id, customer_id, line_user, line_bot, source_event, basic_id, language, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '10 minutes')
    ON CONFLICT (business_id, line_bot, source_event) DO UPDATE SET source_event = excluded.source_event
    WHERE voice_invites.customer_id = excluded.customer_id AND voice_invites.conversation_id = excluded.conversation_id
    RETURNING id, expires_at
  `, [input.businessId, input.conversationId, conversation.customerId, input.lineUser, input.lineBot, input.eventId, input.basicId ?? null, input.language]);
  const url = new URL('/call', base);
  url.searchParams.set('openExternalBrowser', '1');
  url.hash = new URLSearchParams({ invite: invite.id }).toString();
  return { id: invite.id, url: url.toString(), expiresAt: invite.expires_at.toISOString() };
}

export async function createVoiceChallenge(inviteId: string) {
  const proof = randomBytes(32).toString('base64url');
  const command = voiceCommandPrefix + randomBytes(12).toString('base64url');
  const invite = await db.one<{ language: 'th' | 'en'; basic_id: string | null }>(`
    WITH active AS (
      SELECT id, language, basic_id, expires_at FROM voice_invites
      WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
    ), challenge AS (
      INSERT INTO voice_invite_challenges (invite_id, proof_digest, code_digest, expires_at)
      SELECT id, $2, $3, least(expires_at, now() + interval '5 minutes') FROM active RETURNING invite_id
    )
    SELECT active.language, active.basic_id FROM active JOIN challenge ON invite_id = active.id
  `, [inviteId, digest(proof), digest(command)]);
  return { proof, command, language: invite.language, basicId: invite.basic_id };
}

export async function verifyLineVoiceChallenge(input: VerifiedLineSender & { command: string }): Promise<boolean> {
  if (!/^ENDLESS-VOICE:[A-Za-z0-9_-]{16}$/.test(input.command)) return false;
  const result = await db.query(`
    UPDATE voice_invite_challenges AS challenge SET verified_at = coalesce(verified_at, now())
    FROM voice_invites AS invite
    WHERE challenge.invite_id = invite.id AND challenge.code_digest = $1 AND challenge.expires_at > now()
      AND invite.expires_at > now() AND invite.consumed_at IS NULL
      AND invite.business_id = $2 AND invite.line_user = $3 AND invite.line_bot = $4
  `, [digest(input.command), input.businessId, input.lineUser, input.lineBot]);
  return result.rowCount === 1;
}

export async function voiceChallengeStatus(inviteId: string, proof?: string) {
  if (!validProof(proof)) throw new AppError('NOT_FOUND');
  return db.one<{ verified: boolean }>(`
    SELECT challenge.verified_at IS NOT NULL AS verified FROM voice_invite_challenges AS challenge
    JOIN voice_invites AS invite ON invite.id = challenge.invite_id
    WHERE invite.id = $1 AND challenge.proof_digest = $2 AND challenge.expires_at > now()
      AND invite.expires_at > now() AND invite.consumed_at IS NULL
  `, [inviteId, digest(proof!)]);
}
