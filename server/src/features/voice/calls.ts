import { AppError, auditInTransaction, db, type DbExecutor, type LiveVoiceEvent } from '../../core';
import { digest, validProof } from './invites';

export interface CallScope {
  id: string;
  business_id: string;
  customer_id: string;
  conversation_id: string;
  provider_session_id: string;
  started_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  save_transcript: boolean;
}
interface Caption { id: string; role: 'customer' | 'assistant'; text: string; startMs: number; endMs: number }

export function combineCaptions(parts: Caption[]) {
  const lines: Caption[] = [];
  for (const part of parts) {
    const last = lines.at(-1);
    if (last?.role === part.role && part.startMs <= last.endMs + 800 && last.text.length + part.text.length <= 720) {
      last.text += part.text;
      last.endMs = Math.max(last.endMs, part.endMs);
    } else lines.push({ ...part });
  }
  return lines.map(({ id, role, text }) => ({ id, role, text: text.trim() })).filter(({ text }) => text);
}

export async function authorizeCall(sessionId: string, proof: string | undefined): Promise<CallScope> {
  if (!validProof(proof)) throw new AppError('NOT_FOUND');
  return db.one<CallScope>('SELECT * FROM voice_sessions WHERE id = $1 AND proof_digest = $2 AND provider_session_id IS NOT NULL', [sessionId, digest(proof!)]);
}

export async function getRecentVoiceHistory(businessId: string, customerId: string, ex: DbExecutor = db) {
  const { rows } = await ex.query<{ callId: string; startedAt: Date; captions: Caption[] }>(`
    SELECT call.id AS "callId", call.started_at AS "startedAt", captions.items AS captions
    FROM voice_sessions AS call
    JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', caption.item_id, 'role', caption.role, 'text', caption.text,
        'startMs', caption.start_ms, 'endMs', caption.end_ms) ORDER BY caption.start_ms, caption.seq) AS items
      FROM (
        SELECT item_id, role, text, start_ms, end_ms, seq FROM voice_transcripts
        WHERE session_id = call.id ORDER BY start_ms DESC, seq DESC LIMIT 180
      ) AS caption
    ) AS captions ON captions.items IS NOT NULL
    WHERE call.business_id = $1 AND call.customer_id = $2 AND call.save_transcript
      AND (call.ended_at IS NOT NULL OR call.expires_at <= now())
    ORDER BY call.started_at DESC, call.id LIMIT 3
  `, [businessId, customerId]);
  return rows.map(({ callId, startedAt, captions }) => ({
    callId, startedAt: startedAt.toISOString(),
    captions: combineCaptions(captions).slice(-8).map(({ role, text }) => ({ role, text: text.slice(0, 360) })),
  }));
}

export async function getVoiceHistory(sessionId: string, proof?: string) {
  const call = await authorizeCall(sessionId, proof);
  if (Date.now() > (call.ended_at ?? call.expires_at).getTime() + 30_000) throw new AppError('NOT_FOUND');
  return { calls: await getRecentVoiceHistory(call.business_id, call.customer_id) };
}

export async function appendProviderCaption(call: CallScope, caption: Extract<LiveVoiceEvent, { type: 'transcript' }>) {
  if (!call.save_transcript || !caption.text || caption.startMs > 24 * 60 * 60 * 1000 || caption.endMs > 24 * 60 * 60 * 1000) return;
  await db.query(`
    INSERT INTO voice_transcripts (session_id, item_id, role, text, start_ms, end_ms)
    SELECT id, $2, $3, $4, $5, $6 FROM voice_sessions
    WHERE id = $1 AND business_id = $7 AND customer_id = $8 AND save_transcript
      AND least(coalesce(ended_at, expires_at), expires_at) + interval '20 seconds' > now()
      AND (SELECT count(*) FROM voice_transcripts WHERE session_id = $1) < 1200
    ON CONFLICT DO NOTHING
  `, [call.id, caption.eventId, caption.speaker, caption.text.slice(0, 2000), caption.startMs, caption.endMs,
    call.business_id, call.customer_id]);
}

export async function markVoiceEnded(call: Pick<CallScope, 'id' | 'business_id'>) {
  await db.tx(async (tx) => {
    const updated = await tx.query(
      'UPDATE voice_sessions SET ended_at = least(now(), expires_at) WHERE id = $1 AND business_id = $2 AND ended_at IS NULL',
      [call.id, call.business_id]);
    if (!updated.rowCount) return;
    await auditInTransaction(tx, [{
      action: 'voice.session.end', actorUserId: null, businessId: call.business_id, targetType: 'voice_session', targetId: call.id,
    }]);
  });
}

export async function purgeExpiredVoiceInvites() {
  await db.tx(async (tx) => {
    await tx.query("DELETE FROM voice_invite_challenges WHERE expires_at <= now() - interval '1 day'");
    await tx.query("DELETE FROM voice_invites WHERE consumed_at IS NULL AND expires_at <= now() - interval '1 day'");
  });
}
