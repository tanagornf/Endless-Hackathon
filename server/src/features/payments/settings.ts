import { z } from 'zod';
import QRCode from 'qrcode';
import type { PaymentSettingsView } from '@nless/shared/features/payments/types';
import { AppError, auditInTransaction, config, db, decryptSecret, encryptSecret, providerMode, type DbExecutor } from '../../core';
import { buildPromptPayPayload, normalizePromptPayId } from './promptpay';

export const updateSettingsBody = z.strictObject({
  expectedVersion: z.number().int().nonnegative(), promptpayKind: z.enum(['mobile','national_id','ewallet']).nullable(),
  promptpayId: z.string().trim().max(20).nullable(), receiverName: z.string().trim().max(80),
  includeReference: z.boolean(), requestTtlMinutes: z.number().int().min(30).max(4320),
});
export type Recipient = Pick<PaymentSettingsView,'businessId'|'promptpayKind'|'promptpayMasked'|'receiverName'|'includeReference'|'requestTtlMinutes'|'version'> & {
  encrypted: string | null; validatedAt: Date | null;
};
const columns = `business_id AS "businessId",promptpay_kind AS "promptpayKind",promptpay_masked AS "promptpayMasked",
 receiver_name AS "receiverName",include_reference AS "includeReference",request_ttl_minutes AS "requestTtlMinutes",
 promptpay_id_enc AS encrypted,validated_at AS "validatedAt",version`;
export async function recipient(businessId: string, tx: DbExecutor = db) {
  return tx.maybeOne<Recipient>(`SELECT ${columns} FROM payment_settings WHERE business_id=$1`,[businessId]);
}
function view(businessId: string, row: Recipient | null): PaymentSettingsView {
  return {businessId, promptpayKind: row?.promptpayKind ?? null, promptpayMasked: row?.promptpayMasked ?? null,
    receiverName: row?.receiverName ?? '', includeReference: row?.includeReference ?? true,
    requestTtlMinutes: row?.requestTtlMinutes ?? 1440, configured: !!row?.encrypted, validatedAt: row?.validatedAt?.toISOString() ?? null,
    version: row?.version ?? 0, paymentMode:providerMode('payment'), slipVerifyMode:config.SLIP_VERIFY_MODE};
}
export async function getSettings(businessId: string) { return view(businessId, await recipient(businessId)); }
export async function saveSettings(businessId: string, userId: string, input:z.infer<typeof updateSettingsBody>) {
  return db.tx(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ['payment-settings:'+businessId]);
    const old = await recipient(businessId,tx);
    if ((old?.version ?? 0) !== input.expectedVersion)
      throw new AppError('VERSION_CONFLICT','Payment settings changed',{details:{currentVersion:old?.version ?? 0}});
    const kind = input.promptpayKind;
    const id = kind && input.promptpayId ? normalizePromptPayId(kind,input.promptpayId) : null;
    const preserve = !!kind && kind === old?.promptpayKind && !input.promptpayId;
    if (kind && !id && !preserve) throw new AppError('VALIDATION_ERROR','Enter a valid PromptPay ID');
    const encrypted = id ? encryptSecret(id) : preserve ? old?.encrypted : null;
    const masked = id ? (kind === 'mobile' ? 'xxx-xxx-' : 'x'.repeat(id.length-4)) + id.slice(-4) : preserve ? old?.promptpayMasked : null;
    const result = await tx.one<Recipient>(`INSERT INTO payment_settings (business_id,promptpay_kind,promptpay_id_enc,promptpay_masked,receiver_name,
      include_reference,request_ttl_minutes,validated_at,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,$8)
      ON CONFLICT (business_id) DO UPDATE SET promptpay_kind=excluded.promptpay_kind,promptpay_id_enc=excluded.promptpay_id_enc,
      promptpay_masked=excluded.promptpay_masked,receiver_name=excluded.receiver_name,include_reference=excluded.include_reference,
      request_ttl_minutes=excluded.request_ttl_minutes,validated_at=excluded.validated_at,updated_by=excluded.updated_by,
      updated_at=now(),version=payment_settings.version+1 RETURNING ${columns}`,
      [businessId,kind,encrypted,masked,input.receiverName,input.includeReference,input.requestTtlMinutes,userId]);
    await auditInTransaction(tx,[{action:'payments.settings.update',businessId,actorUserId:userId,targetType:'payment_settings',targetId:businessId,
      details:{version:result.version,configured:!!encrypted}}]);
    return view(businessId,result);
  });
}
export async function renderQr(row: Pick<Recipient,'promptpayKind'|'encrypted'|'includeReference'>, amountMinor: number, reference: string | null) {
  if (!row.promptpayKind || !row.encrypted) throw new AppError('VALIDATION_ERROR','Configure a PromptPay recipient first');
  const payload=buildPromptPayPayload({kind:row.promptpayKind,id:decryptSecret(row.encrypted),amountMinor,reference:row.includeReference ? reference : null});
  const bytes=await QRCode.toBuffer(payload,{type:'png',width:720,errorCorrectionLevel:'M'});
  return {payload,bytes};
}
export async function testQr(businessId:string,amountMinor:number) {
  const row=await recipient(businessId);
  if (!row) throw new AppError('VALIDATION_ERROR','Configure a PromptPay recipient first');
  const {payload,bytes}=await renderQr(row,amountMinor,null);
  return {payload,pngBase64:bytes.toString('base64')};
}
