import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { liveSessionId, priceLiveVoice, requireLiveVoiceScope, validateLiveVoiceDuration } from './live-voice';
import type { ModelLiveVoiceUsageInput } from './live-voice-types';

type UsageRow = { id: string; cost: string | null };

export async function recordLiveVoiceDuration(input: ModelLiveVoiceUsageInput) {
  const businessId = requireLiveVoiceScope(input.usage);
  if (!liveSessionId.safeParse(input.providerSessionId).success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid Live session ID');
  }
  const mode = config.MODEL_MODE;
  const model = config.OPENAI_LIVE_MODEL || (mode === 'fake' ? 'fake-live' : '');
  if (!model) throw new AppError('SERVICE_NOT_READY', 'Live voice model is not configured');
  const { accountId, conversationId, turnId } = input.usage;
  const sessionScope = [businessId, accountId ?? null, conversationId ?? null, turnId ?? null, model, mode, input.providerSessionId];
  const duration = input.duration === null ? null : validateLiveVoiceDuration(input.duration);
  const price = mode === 'fake' ? 0 : priceLiveVoice(duration, config.OPENAI_LIVE_ACTIVE_USD_PER_MINUTE, config.OPENAI_LIVE_STANDBY_USD_PER_MINUTE);
  const reason = mode === 'fake' ? 'fake_mode' : price === null ? 'no_rate' : 'priced';

  // A later confirmed close may fill an unconfirmed observation, without inserting another charge.
  const inserted = await db.maybeOne<UsageRow>(`
    INSERT INTO model_usage (business_id,account_id,conversation_id,turn_id,feature_id,purpose,kind,model,mode,
      response_id,cost_usd_micros,cost_reason,audio_seconds,audio_active_seconds,audio_paused_seconds)
    SELECT $1::uuid,$2::uuid,$3::uuid,$4::text,'F30','voice.live.duration','realtime',$5,$6,$7,$8::bigint,$9,$10::numeric,$11::numeric,$12::numeric
    WHERE EXISTS (
      SELECT 1 FROM model_usage
      WHERE business_id=$1 AND account_id IS NOT DISTINCT FROM $2::uuid AND conversation_id IS NOT DISTINCT FROM $3::uuid
        AND turn_id IS NOT DISTINCT FROM $4::text AND model=$5 AND mode=$6 AND response_id=$7
        AND feature_id='F30' AND kind='realtime' AND purpose='voice.live.session'
    )
    ON CONFLICT (response_id) WHERE kind='realtime' AND purpose='voice.live.duration' AND response_id IS NOT NULL
    DO UPDATE SET cost_usd_micros=excluded.cost_usd_micros,cost_reason=excluded.cost_reason,audio_seconds=excluded.audio_seconds,
      audio_active_seconds=excluded.audio_active_seconds,audio_paused_seconds=excluded.audio_paused_seconds
    WHERE model_usage.business_id=excluded.business_id AND model_usage.account_id IS NOT DISTINCT FROM excluded.account_id
      AND model_usage.conversation_id IS NOT DISTINCT FROM excluded.conversation_id
      AND model_usage.turn_id IS NOT DISTINCT FROM excluded.turn_id AND model_usage.model=excluded.model AND model_usage.mode=excluded.mode
      AND model_usage.audio_seconds IS NULL AND excluded.audio_seconds IS NOT NULL
    RETURNING id,cost_usd_micros::text AS cost`, [...sessionScope, price, reason,
    duration?.seconds ?? null, duration?.activeSeconds ?? null, duration?.pausedSeconds ?? null]);
  const saved = inserted ?? await db.maybeOne<UsageRow>(`
    SELECT id,cost_usd_micros::text AS cost FROM model_usage WHERE business_id=$1 AND account_id IS NOT DISTINCT FROM $2::uuid
      AND conversation_id IS NOT DISTINCT FROM $3::uuid AND turn_id IS NOT DISTINCT FROM $4::text AND model=$5 AND mode=$6
      AND response_id=$7 AND kind='realtime' AND purpose='voice.live.duration'`, sessionScope);
  if (!saved) throw new AppError('NOT_FOUND', 'Live voice usage not found for this scope');
  return { usageId: saved.id, costUsdMicros: saved.cost === null ? null : Number(saved.cost) };
}
