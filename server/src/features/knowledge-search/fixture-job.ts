import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SEED } from '@nless/shared/core/fixtures';
import { AppError, audit, auditInTransaction, db, jobs } from '../../core';
import type { JobHandler } from '../../core';
import {
  activateKnowledgeItem, createKnowledgeItem, deleteKnowledgeItem, submitKnowledgeItem,
} from '../knowledge/service';
import { indexKnowledgeRevision } from './indexing';
import { listBusinessKnowledge } from './workbench';
import fixture from './fixtures/retrieval-v1.json';

export const FIXTURE_JOB = 'knowledge-search.fixture-load';
const demoBusiness = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const items = fixture.items.filter(({ business, source }) => business === 'A' && source === 'fx');
const timeoutMs = 120_000;
const retryDelayMs = 1_000;

const Payload = z.object({ businessId: z.string().uuid(), requestKey: z.string().uuid() }).strict();
type Payload = z.infer<typeof Payload>;
type RequestRow = { request_key: string; job_id: string | null; requested_at: Date; completed_at: Date | null; actor_user_id: string | null };

function assertDemo(businessId: string) {
  if (businessId !== demoBusiness) {
    throw new AppError('POLICY_BLOCKED', 'Sample knowledge is available in the demo business', { details: { reason: 'demo_only' } });
  }
}

const controlKey = (businessId: string) => 'knowledge-fixture:' + businessId;
const findRequest = (businessId: string) => db.maybeOne<RequestRow>(
  'SELECT request_key,job_id,requested_at,completed_at,actor_user_id FROM knowledge_fixture_requests WHERE business_id=$1', [businessId],
);
const expired = (request: RequestRow) => Date.now() - request.requested_at.getTime() >= timeoutMs;

export async function queueDemoFixture(businessId: string, actorUserId: string | null): Promise<{ jobId: string }> {
  assertDemo(businessId);
  return db.withAdvisoryLock(controlKey(businessId), async () => {
    const previous = await findRequest(businessId);
    if (previous && !expired(previous) && !previous.completed_at && previous.job_id) {
      const job = await jobs.get(previous.job_id);
      if (job?.state === 'queued' || job?.state === 'running') return { jobId: previous.job_id };
    }
    const requestKey = previous && !previous.job_id && !expired(previous) && !previous.completed_at
      ? previous.request_key : randomUUID();
    if (requestKey !== previous?.request_key) {
      await db.query(
        `INSERT INTO knowledge_fixture_requests (business_id,request_key,actor_user_id)
        VALUES ($1,$2,$3) ON CONFLICT (business_id) DO UPDATE SET
          request_key=EXCLUDED.request_key,actor_user_id=EXCLUDED.actor_user_id,
          job_id=NULL,requested_at=now(),completed_at=NULL`,
        [businessId, requestKey, actorUserId],
      );
    }
    const { jobId } = await jobs.enqueue(FIXTURE_JOB, { businessId, requestKey }, {
      businessId, dedupKey: FIXTURE_JOB + ':' + businessId + ':' + requestKey, maxAttempts: 2,
    });
    await db.query('UPDATE knowledge_fixture_requests SET job_id=$3 WHERE business_id=$1 AND request_key=$2',
      [businessId, requestKey, jobId]);
    return { jobId };
  });
}

export async function removeDemoFixture(businessId: string, actorUserId: string | null): Promise<{ removed: number }> {
  assertDemo(businessId);
  return db.withAdvisoryLock(controlKey(businessId), async () => {
    await db.query('DELETE FROM knowledge_fixture_requests WHERE business_id=$1', [businessId]);
    const managed = (await listBusinessKnowledge(businessId)).filter(({ source }) => source === 'fixture');
    for (const item of managed) await deleteKnowledgeItem(businessId, { userId: actorUserId }, item.id);
    await audit({ action: 'knowledge-search.fixture.remove', businessId, actorUserId, targetType: 'business', targetId: businessId,
      details: { removed: managed.length } });
    return { removed: managed.length };
  });
}

export const fixtureJobHandler: JobHandler<Payload> = async (job) => {
  const parsed = Payload.safeParse(job.payload);
  if (!parsed.success || parsed.data.businessId !== job.businessId) {
    throw new AppError('VALIDATION_ERROR', 'Invalid fixture job scope');
  }
  const { businessId, requestKey } = parsed.data;
  assertDemo(businessId);
  return db.withAdvisoryLock(controlKey(businessId), async () => {
    job.signal.throwIfAborted();
    const request = await findRequest(businessId);
    if (!request || request.request_key !== requestKey) return { result: { superseded: true } };
    if (request.completed_at) return { result: { active: items.length } };
    if (expired(request)) throw new AppError('KNOWLEDGE_NOT_READY', 'Fixture indexing timed out');
    if (!request.job_id) {
      await db.query('UPDATE knowledge_fixture_requests SET job_id=$3 WHERE business_id=$1 AND request_key=$2',
        [businessId, requestKey, job.id]);
    }
    const actor = { userId: request.actor_user_id };
    const managed = new Map((await listBusinessKnowledge(businessId)).filter(({ source }) => source === 'fixture')
      .map((item) => [item.title, item]));
    let active = 0;
    for (const sample of items) {
      job.signal.throwIfAborted();
      const item = managed.get(sample.title) ?? await createKnowledgeItem(businessId, actor,
        { kind: 'article', title: sample.title, body: sample.body, folderId: null }, { source: 'fixture' });
      if (item.status === 'active' && item.indexState === 'ready') {
        active++;
        continue;
      }
      if (item.status === 'draft') {
        await submitKnowledgeItem(businessId, actor, item.id, item.revision);
        continue;
      }
      if (item.indexState === 'ready') {
        await activateKnowledgeItem(businessId, actor, item.id, { expectedRevision: item.revision, acknowledgeModeration: false });
        active++;
        continue;
      }
      const state = await db.maybeOne<{ state: string; updated_at: Date }>(
        'SELECT state,updated_at FROM knowledge_index_states WHERE business_id=$1 AND item_id=$2 AND revision=$3',
        [businessId, item.id, item.revision],
      );
      if (state?.state === 'failed' && state.updated_at >= request.requested_at) {
        throw new AppError('KNOWLEDGE_NOT_READY', 'Fixture indexing failed', { details: { fixture: sample.key } });
      }
      if (!state || state.state === 'failed') await indexKnowledgeRevision({ businessId, itemId: item.id, revision: item.revision });
    }
    await job.progress(active, items.length);
    if (active < items.length) return { retryAt: new Date(Date.now() + retryDelayMs).toISOString() };
    await db.tx(async (tx) => {
      await tx.query('UPDATE knowledge_fixture_requests SET completed_at=now() WHERE business_id=$1 AND request_key=$2',
        [businessId, requestKey]);
      await auditInTransaction(tx, [{
        action: 'knowledge-search.fixture.load', businessId, actorUserId: actor.userId, targetType: 'business', targetId: businessId,
        details: { active },
      }]);
    });
    return { result: { active } };
  });
};
