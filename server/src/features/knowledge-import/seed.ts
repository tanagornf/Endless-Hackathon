import type { FeatureSeed, SeedContext } from '../../core';

export default { featureId: 'F06', dependsOn: ['core'], async run() {} } satisfies FeatureSeed;

export async function resetDemo({ db, id }: SeedContext): Promise<void> {
  const businessId = id('biz_demo_a');
  await db.tx(async tx => {
    const deleted = await tx.query<{ id: string }>(
      "DELETE FROM import_jobs WHERE business_id=$1 AND source_label LIKE 'e2e-%' RETURNING id",
      [businessId],
    );
    if (deleted.rows.length) await tx.query(
      'DELETE FROM knowledge_source_versions WHERE business_id=$1 AND import_id=ANY($2::uuid[])',
      [businessId, deleted.rows.map(row => row.id)],
    );
  });
}
