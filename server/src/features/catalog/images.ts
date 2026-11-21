import sharp from 'sharp';
import { AppError, assertRateLimit, auditInTransaction, db, model, storage } from '../../core';
import type { DbExecutor, UploadedFile } from '../../core';
import { adminView, findItemRow, getItemAdmin, isItemId } from './repo';

export const catalogImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImages = 5;

function checkLimit(count: number): void {
  if (count >= maxImages) throw new AppError('VALIDATION_ERROR', 'Up to five images per product', { details: { reason: 'image_limit' } });
}

async function validateImage(file?: UploadedFile): Promise<UploadedFile> {
  if (!file || !catalogImageMimes.includes(file.mimeType) || !file.bytes.length || file.bytes.length > 8 * 1024 * 1024) {
    throw new AppError('VALIDATION_ERROR', 'Choose a JPEG, PNG or WebP image up to 8 MB');
  }
  try {
    const image = sharp(file.bytes, { limitInputPixels: 40_000_000, failOn: 'error' });
    const info = await image.metadata();
    if ('image/' + info.format !== file.mimeType) throw new Error('Unexpected format');
    await image.resize(1, 1).raw().toBuffer();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The uploaded file is not a readable product image');
  }
  return file;
}

async function changeImages(businessId: string, itemId: string, change: (tx: DbExecutor) => Promise<void>) {
  if (!isItemId(itemId)) throw new AppError('NOT_FOUND', 'Catalog item not found');
  return db.tx(async (tx) => {
    await tx.one('SELECT id FROM catalog_items WHERE business_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE', [businessId, itemId]);
    await change(tx);
    return adminView(await findItemRow(tx, businessId, itemId));
  });
}

export async function addImage(businessId: string, actorUserId: string, itemId: string, upload: UploadedFile | undefined, alt: string) {
  const item = await getItemAdmin(businessId, itemId);
  checkLimit(item.images.length);
  assertRateLimit({ key: 'catalog:upload:' + businessId, limit: 30, windowSeconds: 60 });
  const file = await validateImage(upload);
  const saved = await storage.save({
    businessId, uploadedBy: actorUserId, purpose: 'catalog', originalName: file.originalName,
    mimeType: file.mimeType, bytes: file.bytes, allowedMime: catalogImageMimes,
  });
  const moderation = await model.moderate({
    usage: { featureId: 'F08', purpose: 'moderate', businessId }, images: [{ uploadRef: saved.id }],
  }).catch(() => ({ flagged: false }));
  return changeImages(businessId, itemId, async (tx) => {
    const { count, next } = await tx.one<{ count: number; next: number }>(
      'SELECT count(*)::int AS count, coalesce(max(position)+1,0) AS next FROM catalog_item_images WHERE business_id=$1 AND item_id=$2',
      [businessId, itemId],
    );
    checkLimit(count);
    const image = await tx.one<{ id: string }>(
      'INSERT INTO catalog_item_images (business_id,item_id,file_id,position,alt,flagged) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [businessId, itemId, saved.id, next, alt.trim(), moderation.flagged],
    );
    await auditInTransaction(tx, [{ action: 'catalog.image.add', actorUserId, businessId, targetType: 'catalog_item', targetId: itemId,
      details: { imageId: image.id, fileId: saved.id, flagged: moderation.flagged } }]);
  });
}

export async function removeImage(businessId: string, actorUserId: string, itemId: string, imageId: string) {
  if (!isItemId(imageId)) throw new AppError('NOT_FOUND', 'Catalog image not found');
  return changeImages(businessId, itemId, async (tx) => {
    const { position } = await tx.one<{ position: number }>(
      'DELETE FROM catalog_item_images WHERE business_id=$1 AND item_id=$2 AND id=$3 RETURNING position', [businessId, itemId, imageId],
    );
    await tx.query('UPDATE catalog_item_images SET position=position-1 WHERE business_id=$1 AND item_id=$2 AND position>$3',
      [businessId, itemId, position]);
    await auditInTransaction(tx, [{ action: 'catalog.image.remove', actorUserId, businessId, targetType: 'catalog_item', targetId: itemId,
      details: { imageId } }]);
  });
}

export async function reorderImages(businessId: string, itemId: string, imageIds: string[]) {
  return changeImages(businessId, itemId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM catalog_item_images WHERE business_id=$1 AND item_id=$2', [businessId, itemId]);
    const ordered = new Set(imageIds);
    if (imageIds.length !== rows.length || ordered.size !== rows.length || !rows.every((row) => ordered.has(row.id))) {
      throw new AppError('VALIDATION_ERROR', 'Supply each current image exactly once');
    }
    await tx.query('UPDATE catalog_item_images i SET position=o.pos-1 FROM unnest($3::uuid[]) WITH ORDINALITY AS o(id,pos) ' +
      'WHERE i.business_id=$1 AND i.item_id=$2 AND i.id=o.id', [businessId, itemId, imageIds]);
  });
}

export async function readImage(businessId: string, itemId: string, imageId: string) {
  const item = await getItemAdmin(businessId, itemId);
  const image = item.images.find(({ id }) => id === imageId);
  const stored = image && await storage.read(image.fileId, { businessId });
  if (!stored || !catalogImageMimes.includes(stored.file.mimeType)) throw new AppError('NOT_FOUND', 'Catalog image not found');
  return { kind: 'file' as const, bytes: stored.bytes, mimeType: stored.file.mimeType, inline: true };
}
