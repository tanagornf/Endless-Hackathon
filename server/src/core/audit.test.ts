import { expect, test, vi } from 'vitest';
import { audit, auditInTransaction } from './audit';
import { db } from './db';
import { requestContext } from './log';

test('transaction audit batches both events on the supplied executor with request context', async () => {
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({ rows: [], rowCount: 2 }));
  const tx = { ...db, query };
  await requestContext.run({ requestId: 'synthetic-request' }, () => auditInTransaction(tx, [
    { action: 'synthetic.create', actorUserId: null, targetType: 'fixture', targetId: 'first', details: { quantity: 2 } },
    { action: 'synthetic.update', actorUserId: null, requestId: 'explicit-request' },
  ]));
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, params] = query.mock.calls[0]!;
  expect(sql).toContain('jsonb_to_recordset($1::jsonb)');
  expect(JSON.parse(String(params?.[0]))).toEqual([
    {
      action: 'synthetic.create', actor_user_id: null, business_id: null, account_id: null,
      target_type: 'fixture', target_id: 'first', details: '{"quantity":2}', request_id: 'synthetic-request',
    },
    {
      action: 'synthetic.update', actor_user_id: null, business_id: null, account_id: null,
      target_type: null, target_id: null, details: '{}', request_id: 'explicit-request',
    },
  ]);
});

test('empty audit batches are skipped and a failed insert reaches the caller', async () => {
  const failure = new Error('Synthetic audit insertion failure');
  const query = vi.fn(async () => { throw failure; });
  const tx = { ...db, query };
  await auditInTransaction(tx, []);
  expect(query).not.toHaveBeenCalled();
  await expect(auditInTransaction(tx, [{ action: 'synthetic.create', actorUserId: null }])).rejects.toBe(failure);
});

test('ordinary audit writes one event through the pooled executor', async () => {
  const query = vi.spyOn(db, 'query').mockResolvedValue({ rows: [], rowCount: 1 });
  try {
    await audit({ action: 'synthetic.create', actorUserId: null });
    expect(query).toHaveBeenCalledTimes(1);
  } finally {
    query.mockRestore();
  }
});
