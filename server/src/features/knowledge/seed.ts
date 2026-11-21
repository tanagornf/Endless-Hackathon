import type { FeatureSeed, SeedContext } from '../../core';
import { contentHash } from './hash';
import { deleteKnowledgeItem } from './service';

export default {
  featureId: 'F05',
  dependsOn: ['core'],
  async run({ db, fixtures, id, log }) {
    await db.tx(async (tx) => {
      for (const folder of fixtures.knowledgeFolders) {
        await tx.query('INSERT INTO knowledge_folders (id,business_id,name) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
          [id(folder.alias), id(folder.businessAlias), folder.name]);
      }
      for (const entry of fixtures.knowledge) {
        const itemId = id(entry.alias);
        const businessId = id(entry.businessAlias);
        const folderId = entry.folderAlias ? id(entry.folderAlias) : null;
        const kind = entry.alias.endsWith('_faq') ? 'faq' : 'article';
        await tx.query(
          'INSERT INTO knowledge_items (id,business_id,folder_id,kind,title,body,status,revision,source,content_hash,deleted_at) ' +
          "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'seed',$9,CASE WHEN $7='deleted' THEN now() END) ON CONFLICT (id) DO NOTHING",
          [itemId, businessId, folderId, kind, entry.title, entry.body, entry.status, entry.revision, contentHash(entry.title, entry.body)],
        );
        for (let revision = 1; revision <= entry.revision; revision++) {
          const body = entry.alias === 'kn_a_deleted' && revision === 1 ? 'ราคา 990 บาท' : entry.body;
          await tx.query(
            'INSERT INTO knowledge_revisions (business_id,item_id,revision,kind,title,body,folder_id) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (item_id,revision) DO NOTHING',
            [businessId, itemId, revision, kind, entry.title, body, folderId],
          );
        }
      }
    });
    log('knowledge: ' + fixtures.knowledge.length + ' items');
  },
} satisfies FeatureSeed;

export async function resetDemo({ db, id }: SeedContext): Promise<void> {
  const businessId = id('biz_demo_a');
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM knowledge_items WHERE business_id=$1 AND status<>'deleted' AND source IN ('manual','fixture') " +
    "AND created_at >= (SELECT min(created_at) FROM knowledge_items WHERE business_id=$1 AND source='seed')",
    [businessId],
  );
  for (const entry of rows) await deleteKnowledgeItem(businessId, { userId: null }, entry.id);
}
