import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { SEED } from '@nless/shared/core/fixtures';
import type { FeatureId } from '@nless/shared/core/features';
import { formatMoneyText } from '@nless/shared/core/language';
import { audit } from './audit';
import { config } from './config';
import { assertSafeDbName, db, dbPool, dbUrl } from './db';
import { DEMO_BUSINESS_IDS, DEMO_RESET_LOCK } from './demo-scope';
import { AppError } from './errors';
import { log } from './log';
import { withModelCallsDisabled } from './model';
import { featureSeeds, seed, seedContext, seedId } from './seed';
import { storage, uploadDirectory } from './storage';

const mainShop = seedId('biz_demo_a');
const extras = [
  ['ของเล่นไม้', 29000], ['ชุดบอร์ดเกม', 69000], ['การ์ดภาพ', 39000],
  ['ชุดตัวต่อ', 119000], ['เกมคำศัพท์', 159000], ['เกมผจญภัย', 259000],
] as const;
const topics = [
  ['line', 'price', 'A-GAME-01 ราคาเท่าไหร่คะ', 'รุ่นนี้ราคา 1,490 บาทค่ะ'],
  ['web', 'discount', 'ขอส่วนลดเพิ่มได้ไหมคะ', 'ตอนนี้ราคา 1,490 บาทค่ะ'],
  ['web', 'stock', 'A-SOLD-01 ยังมีไหมครับ', 'ตอนนี้สินค้าหมดแล้วค่ะ'],
  ['web', 'payment', 'ส่งสลิปแล้วนะคะ', 'พนักงานจะตรวจสอบสลิปให้ค่ะ'],
  ['line', 'booking', 'ขอนัดเรียนเล่นเกมวันพรุ่งนี้ค่ะ', 'ได้ค่ะ มีรอบเช้าและรอบบ่าย'],
  ['web', 'handoff', 'ขอคุยกับพนักงานค่ะ', 'ส่งเรื่องให้พนักงานแล้วค่ะ'],
  ['web', 'repeat', 'อยากสั่งเหมือนรอบที่แล้วครับ', 'พนักงานช่วยตรวจสอบรายการเดิมให้ค่ะ'],
  ['web', 'shipping', 'ของส่งช้ากว่ากำหนดค่ะ', 'ขอตรวจสอบการจัดส่งให้นะคะ'],
] as const;

function stableId(name: string): string {
  const namespace = Buffer.from('566994cbe71a4ff6b52000a40213289e', 'hex');
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
const xml = (value: string) => value.replace(/[&<>"']/g, (token) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[token]!);
async function createImages() {
  const items = [
    ...SEED.catalog.map((item) => ({ ...item, businessId: seedId(item.businessAlias) })),
    ...extras.map(([name, priceMinor], index) => ({ name, priceMinor, sku: 'A-DEMO-0' + (index + 1), businessId: mainShop })),
  ];
  for (const item of items) {
    const alias = 'file_img_' + item.sku.toLowerCase().replace(/-/g, '_');
    if (await db.maybeOne('SELECT 1 FROM seed_aliases WHERE alias=$1', [alias])) continue;
    const hue = createHash('sha256').update(item.sku).digest()[0] % 180 + 70;
    const picture = `<svg width="640" height="640" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="hsl(${hue},45%,24%)"/><stop offset="1" stop-color="hsl(${hue},55%,42%)"/></linearGradient></defs>
      <rect width="640" height="640" fill="url(#bg)"/><rect x="34" y="34" width="572" height="572" rx="32" fill="none" stroke="#fff" opacity=".4"/>
      <text x="60" y="105" font-family="sans-serif" font-size="24" fill="#fff">DEMO · ${xml(item.sku)}</text>
      <text x="60" y="340" font-family="sans-serif" font-size="38" fill="#fff">${xml(item.name)}</text>
      <text x="60" y="400" font-family="sans-serif" font-size="28" fill="#fff">${xml(formatMoneyText(item.priceMinor, 'th'))}</text></svg>`;
    const bytes = await sharp(Buffer.from(picture)).png().toBuffer();
    const image = await storage.save({ businessId: item.businessId, uploadedBy: null, originalName: item.sku + '.png', mimeType: 'image/png', purpose: 'product_image', bytes });
    await db.query("INSERT INTO seed_aliases (alias,id,kind) VALUES ($1,$2,'files') ON CONFLICT DO NOTHING", [alias, image.id]);
  }
}

export async function seedDemoData(onFeatureError?: (featureId: FeatureId, error: unknown) => void): Promise<void> {
  await db.withAdvisoryLock('nless.demo.seed', async () => {
    await createImages();
    await db.tx(async (tx) => {
      for (const [index, [channel, topic, question, answer]] of topics.entries()) {
        const alias = 'demo-rich-' + topic;
        const customer = stableId(alias + ':customer');
        const conversation = stableId(alias + ':conversation');
        const time = new Date(Date.now() - index * 22 * 3600000);
        await tx.query(`INSERT INTO customers (id,business_id,channel,external_id,display_name)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [customer, mainShop, channel, alias, 'ลูกค้าเดโม ' + (index + 1)]);
        await tx.query(`INSERT INTO conversations (id,business_id,channel,customer_id,handler,next_seq,created_at,last_inbound_at,last_message_at,last_message_preview)
          VALUES ($1,$2,$3,$4,$5,3,$6,$6,$6,$7) ON CONFLICT DO NOTHING`, [conversation, mainShop, channel, customer, topic === 'handoff' ? 'human' : 'ai', time, answer]);
        for (const [partIndex, text] of [question, answer].entries()) {
          const inbound = partIndex === 0;
          await tx.query(`INSERT INTO messages (id,business_id,conversation_id,seq,direction,author,parts,text,channel,origin,created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'demo',$10) ON CONFLICT DO NOTHING`, [
            stableId(alias + ':message:' + partIndex), mainShop, conversation, partIndex + 1, inbound ? 'inbound' : 'outbound',
            inbound ? 'customer' : topic === 'handoff' ? 'staff' : 'ai', JSON.stringify([{ type: 'text', text }]), text, channel, time,
          ]);
        }
      }
    });
    for (const module of await featureSeeds()) {
      try { await module.runDemo?.(seedContext); }
      catch (error) {
        log.warn({ featureId: module.default.featureId }, 'Demo seed did not complete');
        onFeatureError?.(module.default.featureId, error);
      }
    }
  });
}

function assertDemoResetAllowed(): void {
  if (config.NODE_ENV === 'production') {
    if (!config.DEMO_RESET_ENABLED) throw new AppError('PERMISSION_DENIED', 'Demo reset is disabled');
  } else assertSafeDbName(decodeURIComponent(new URL(dbUrl()).pathname.slice(1)));
}

export async function withDemoResetLock<T>(work: () => Promise<T>): Promise<T> {
  assertDemoResetAllowed();
  const client = await dbPool().connect();
  let held = false;
  let disconnected = false;
  const onError = () => { disconnected = true; };
  client.on('error', onError);
  try {
    const result = await client.query<{ held: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS held', [DEMO_RESET_LOCK]);
    held = result.rows[0]?.held === true;
    if (!held) throw new AppError('POLICY_BLOCKED', 'Demo reset is already running', { details: { reason: 'reset_in_progress' } });
    return await work();
  } finally {
    if (held && !disconnected) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [DEMO_RESET_LOCK]).catch(() => { disconnected = true; });
    }
    client.off('error', onError);
    client.release(disconnected);
  }
}

export async function clearDemoData(): Promise<void> {
  assertDemoResetAllowed();
  const files = await db.tx(async (tx) => {
    for (const table of ['jobs', 'messages', 'conversations', 'customers']) await tx.query('DELETE FROM ' + table + ' WHERE business_id = ANY($1::uuid[])', [DEMO_BUSINESS_IDS]);
    const deleted = await tx.query<{ storage_path: string }>(`DELETE FROM files WHERE business_id = ANY($1::uuid[])
      AND NOT EXISTS(SELECT 1 FROM seed_aliases WHERE seed_aliases.id=files.id AND kind='files') RETURNING storage_path`, [DEMO_BUSINESS_IDS]);
    return deleted.rows;
  });
  for (const file of files) {
    const path = resolve(uploadDirectory, file.storage_path);
    if (path.startsWith(uploadDirectory + sep)) await unlink(path).catch(() => {});
  }
}

export async function resetDemoData(): Promise<void> {
  await withDemoResetLock(() => withModelCallsDisabled(async () => {
    const modules = (await featureSeeds()).reverse();
    for (const module of modules) await module.resetDemo?.(seedContext);
    await clearDemoData();
    await seed((featureId) => log.warn({ featureId }, 'Demo reset seed did not complete'));
    await seedDemoData();
    await audit({ action: 'core.demo.reset', actorUserId: null });
  }));
}
