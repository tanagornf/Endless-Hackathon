import type { DemoChatActionResult, DemoChatSettingsView } from '@nless/shared/features/inbox/types';
import { AppError, audit, config, db, storage } from '../../core';
import { createBooking } from '../booking/service';
import { createOrderFromProposal } from '../orders/service';
import { closeConversation } from '../team/service';
import { capacity, conversationFor, getTodayTurns } from './demoChat';
import type { DemoIdentity, DemoSettingsRow } from './demoChat';
import { signalDemoConversation } from './demoSignal';
import { uuidPattern } from './schemas';

type EditableDemo = Omit<DemoChatSettingsView, 'publicUrl' | 'todayTurns' | 'dailyCap'>;
type DemoAction = {
  clientRequestId: string;
  kind: 'order' | 'booking';
  proposalId: string;
  version: number;
  reviewToken: string;
  decision: 'confirm' | 'cancel';
};

const settingsSelect = `business_id AS "businessId", enabled, public_slug AS "publicSlug",
  welcome_text AS "welcomeText", suggested_questions AS "suggestedQuestions",
  welcome_text_en AS "welcomeTextEn", suggested_questions_en AS "suggestedQuestionsEn"`;

function publicUrl(slug: string): string {
  return (config.PUBLIC_BASE_URL || config.APP_BASE_URL).replace(/\/$/u, '') + '/demo-chat/s/' + encodeURIComponent(slug);
}

export async function demoSettings(businessId: string): Promise<DemoChatSettingsView> {
  const [row, todayTurns] = await Promise.all([
    db.maybeOne<DemoSettingsRow>('SELECT ' + settingsSelect + ' FROM demo_chat_settings WHERE business_id=$1', [businessId]),
    getTodayTurns(businessId),
  ]);
  const publicSlug = row?.publicSlug ?? 'shop-' + businessId.replaceAll('-', '').slice(0, 24);
  return {
    publicSlug, enabled: row?.enabled ?? false, welcomeText: row?.welcomeText ?? null,
    suggestedQuestions: row?.suggestedQuestions ?? [], welcomeTextEn: row?.welcomeTextEn ?? null,
    suggestedQuestionsEn: row?.suggestedQuestionsEn ?? [], publicUrl: publicUrl(publicSlug), dailyCap: capacity(), todayTurns,
  };
}

export async function updateDemoSettings(businessId: string, actorUserId: string, input: EditableDemo) {
  const { enabled, publicSlug, welcomeText, suggestedQuestions, welcomeTextEn, suggestedQuestionsEn } = input;
  try {
    await db.query(`INSERT INTO demo_chat_settings (
      business_id,enabled,public_slug,welcome_text,suggested_questions,welcome_text_en,suggested_questions_en,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (business_id) DO UPDATE SET enabled=EXCLUDED.enabled,public_slug=EXCLUDED.public_slug,
        welcome_text=EXCLUDED.welcome_text,suggested_questions=EXCLUDED.suggested_questions,
        welcome_text_en=EXCLUDED.welcome_text_en,suggested_questions_en=EXCLUDED.suggested_questions_en,
        updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [businessId, enabled, publicSlug, welcomeText, suggestedQuestions, welcomeTextEn, suggestedQuestionsEn, actorUserId]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new AppError('IDEMPOTENCY_CONFLICT', 'Demo Chat link already in use');
    throw error;
  }
  await audit({ action: 'inbox.demo_chat.settings.update', actorUserId, businessId, targetType: 'business', targetId: businessId,
    details: { enabled } });
  return demoSettings(businessId);
}

export async function resetDemoConversation(identity: DemoIdentity) {
  const conversation = await conversationFor(identity, true);
  if (!conversation) return { ok: true as const };
  try {
    await closeConversation(conversation.id, { reason: 'demo_reset', businessId: identity.businessId, actorUserId: identity.userId ?? null });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'SERVICE_NOT_READY') throw error;
    await db.query(`UPDATE conversations SET status='closed',closed_at=now(),version=version+1
      WHERE business_id=$1 AND id=$2 AND status='open'`, [identity.businessId, conversation.id]);
  }
  signalDemoConversation(conversation.id);
  await audit({ action: 'inbox.demo_chat.reset', actorUserId: identity.userId ?? null, businessId: identity.businessId,
    targetType: 'conversation', targetId: conversation.id });
  return { ok: true as const };
}

export async function performDemoAction(identity: DemoIdentity, action: DemoAction): Promise<DemoChatActionResult> {
  const conversation = await conversationFor(identity);
  if (!conversation) throw new AppError('NOT_FOUND', 'Proposal not found');
  const type = action.kind === 'order' ? 'order_review' : 'booking_review';
  const ownsProposal = await db.maybeOne(`SELECT 1 FROM messages m
    CROSS JOIN LATERAL jsonb_array_elements(m.parts) AS entry(part)
    WHERE m.business_id=$1 AND m.conversation_id=$2 AND part->>'type'=$3 AND part->>'proposalId'=$4 LIMIT 1`,
  [identity.businessId, conversation.id, type, action.proposalId]);
  if (!ownsProposal) throw new AppError('NOT_FOUND', 'Proposal not found');
  const { kind, ...input } = action;
  const confirmation = { ...input, stage: 'confirm' as const, businessId: identity.businessId,
    conversationId: conversation.id, actor: { kind: 'customer' as const } };
  const result = kind === 'order' ? await createOrderFromProposal(confirmation) : await createBooking(confirmation);
  if (result.stage !== 'confirm') throw new AppError('SERVICE_NOT_READY', 'Proposal confirmation unavailable');
  return { decision: action.decision, replayed: result.replayed };
}

export async function readDemoFile(identity: DemoIdentity, fileId: string) {
  if (!uuidPattern.test(fileId)) throw new AppError('NOT_FOUND', 'Chat attachment not found');
  const conversation = await conversationFor(identity);
  if (!conversation) throw new AppError('NOT_FOUND', 'Chat attachment not found');
  const visible = await db.maybeOne(`SELECT 1 FROM messages m
    WHERE m.business_id=$1 AND m.conversation_id=$2 AND m.author <> 'system'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(m.parts) AS entry(part)
        WHERE part->>'fileId'=$3 OR EXISTS (SELECT 1 FROM jsonb_array_elements(
          CASE WHEN part->>'type'='product_card' THEN part->'items' ELSE '[]'::jsonb END
        ) AS card(item) WHERE item->>'imageFileId'=$3)) LIMIT 1`, [identity.businessId, conversation.id, fileId]);
  if (!visible) throw new AppError('NOT_FOUND', 'Chat attachment not found');
  const stored = await storage.read(fileId, { businessId: identity.businessId });
  if (!stored) throw new AppError('NOT_FOUND', 'Chat attachment not found');
  const { bytes, file: { mimeType, originalName } } = stored;
  return { kind: 'file' as const, bytes, mimeType, fileName: originalName,
    inline: mimeType.startsWith('image/') || mimeType === 'application/pdf' };
}
