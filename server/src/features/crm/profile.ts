import type { z } from 'zod';
import { AppError, auditInTransaction, db, publish } from '../../core';
import { detail, personFor } from './repo';
import type { UpdateProfileBody } from './schemas';

const fields = ['phone', 'email', 'address', 'note'] as const;
type ContactField = typeof fields[number];
type StoredProfile = Record<ContactField, string> & { version: number };

export async function updateProfile(businessId: string, customerId: string, actorUserId: string, input: z.output<typeof UpdateProfileBody>) {
  const provided = fields.filter(field => input[field] !== undefined);
  if (!provided.length) throw new AppError('VALIDATION_ERROR', 'Provide a contact field to update');
  const modified = await db.tx(async tx => {
    const personId = await personFor(tx, businessId, customerId);
    // An absent profile has version one. The unique key also serializes simultaneous first writes.
    await tx.query('INSERT INTO crm_profiles (business_id,person_id) VALUES ($1,$2) ON CONFLICT (person_id) DO NOTHING',
      [businessId, personId]);
    const current = await tx.one<StoredProfile>(`SELECT phone,email,address,note,version FROM crm_profiles
      WHERE business_id=$1 AND person_id=$2 FOR UPDATE`, [businessId, personId]);
    if (current.version !== input.expectedVersion) {
      throw new AppError('VERSION_CONFLICT', 'Customer profile changed', { details: { currentVersion: current.version } });
    }
    const changedFields = provided.filter(field => input[field] !== current[field]);
    if (!changedFields.length) return false;
    const phone = input.phone ?? current.phone;
    const email = input.email ?? current.email;
    await tx.query(`UPDATE crm_profiles SET phone=$3,phone_norm=$4,email=$5,email_norm=$6,address=$7,note=$8,
      updated_by=$9,updated_at=now(),version=version+1 WHERE business_id=$1 AND person_id=$2`,
      [businessId, personId, phone, phone.replace(/\D/g,''), email, email.toLowerCase(),
       input.address ?? current.address, input.note ?? current.note, actorUserId]);
    await auditInTransaction(tx, [{ action: 'crm.profile.update', actorUserId, businessId, targetType: 'customer',
      targetId: customerId, details: { fields: changedFields } }]);
    return true;
  });
  if (modified) publish(businessId, { type: 'custom', featureId: 'F24', name: 'crm.customer.changed', data: { customerId } });
  return detail(businessId, customerId);
}
