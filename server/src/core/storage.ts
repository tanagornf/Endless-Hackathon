import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config, rootDir } from './config';
import { db } from './db';
import { AppError } from './errors';
import type { StorageApi, StoredFile } from './types';

export const uploadDirectory = resolve(rootDir, config.UPLOAD_DIR);
export async function checkStorage(): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });
  await access(uploadDirectory, constants.W_OK);
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const columns = 'id,business_id AS "businessId",purpose,original_name AS "originalName",mime_type AS "mimeType",size_bytes::int AS "sizeBytes",sha256,created_at AS "createdAt"';
type FileRow = Omit<StoredFile, 'createdAt'> & { createdAt: Date };
const asStoredFile = (row: FileRow): StoredFile => ({ ...row, createdAt: row.createdAt.toISOString() });
export function assertUploadAllowed(input: { purpose: string; mimeType: string; size: number; bytes?: Uint8Array }): { mimeType: string } {
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > config.UPLOAD_MAX_MB * 1024 * 1024) {
    throw new AppError('VALIDATION_ERROR', 'Upload size is not allowed');
  }
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mimeType)) throw new AppError('VALIDATION_ERROR', 'Invalid content type');
  return { mimeType: input.mimeType.toLowerCase() };
}
export const storage: StorageApi = {
  async save(input) {
    const { mimeType } = assertUploadAllowed({ purpose: input.purpose, mimeType: input.mimeType, size: input.bytes.length, bytes: input.bytes });
    if (!uuid.test(input.businessId) || (input.allowedMime && !input.allowedMime.includes(mimeType))) throw new AppError('VALIDATION_ERROR', 'File is not allowed');
    const id = randomUUID();
    const folder = resolve(uploadDirectory, input.businessId);
    const path = resolve(folder, id);
    await mkdir(folder, { recursive: true });
    await writeFile(path, input.bytes, { flag: 'wx', mode: 0o600 });
    try {
      const file = await db.one<FileRow>(`INSERT INTO files (id,business_id,uploaded_by,purpose,original_name,mime_type,size_bytes,sha256,storage_path)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ` + columns, [
        id, input.businessId, input.uploadedBy, input.purpose, input.originalName, mimeType, input.bytes.length,
        createHash('sha256').update(input.bytes).digest('hex'), input.businessId + '/' + id,
      ]);
      return asStoredFile(file);
    } catch (error) {
      await unlink(path).catch(() => {});
      throw error;
    }
  },
  async read(fileId, opts) {
    if (!uuid.test(fileId) || !uuid.test(opts.businessId)) return null;
    const row = await db.maybeOne<FileRow>('SELECT ' + columns + ' FROM files WHERE id=$1 AND business_id=$2', [fileId, opts.businessId]);
    if (!row) return null;
    return { file: asStoredFile(row), bytes: await readFile(resolve(uploadDirectory, opts.businessId, fileId)) };
  },
};
