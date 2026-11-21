import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { config, db, model } from '../../../core';
import { closeDb, dbUrl } from '../../../core/db';
import type { MessageRecord } from '@nless/shared/features/inbox/types';
import { casualIntent, classifyIntent } from '../classifier';
import { explicitlyRequestsStaff, replyToStaffOffer } from '../intents';

const fixtureSchema = z.array(z.strictObject({
  id: z.string(),
  language: z.enum(['th', 'en']),
  kind: z.string(),
  expectedHandoff: z.boolean(),
  expectedPath: z.enum(['regex', 'classifier']),
  text: z.string(),
  previousShop: z.string().optional(),
  offerPending: z.boolean().optional(),
}));
type Fixture = z.infer<typeof fixtureSchema>[number];
const fixture = fixtureSchema.parse(JSON.parse(readFileSync(new URL('./handoff-fixture.json', import.meta.url), 'utf8')));
const classifierThreshold = 0.85;
const timeoutMs = 8000;
const runId = 'f10-118-benchmark-' + randomUUID();
const syntheticBusinessId = randomUUID();
const syntheticConversationId = randomUUID();

function fastPath(row: Fixture) {
  if (explicitlyRequestsStaff(row.text) || (row.offerPending && replyToStaffOffer(row.text) === 'accepted')) {
    return { label: 'ESCALATION', handoff: true };
  }
  const casual = casualIntent([row.text]);
  return casual ? { label: casual.label, handoff: false } : null;
}

function syntheticMessage(text: string, seq: number, author: 'ai' | 'customer'): MessageRecord {
  return {
    id: randomUUID(), businessId: syntheticBusinessId, conversationId: syntheticConversationId,
    seq, author, authorUserId: null, direction: author === 'customer' ? 'inbound' : 'outbound',
    parts: [{ type: 'text', text }], text, channel: 'web', origin: 'demo', externalId: null, groupId: null,
    delivery: { mode: null, state: 'not_required', externalRef: null, error: null },
    createdAt: '2026-11-21T00:00:00.000Z',
  };
}

async function score(row: Fixture) {
  const prior = row.previousShop ? [syntheticMessage(row.previousShop, 1, 'ai')] : [];
  const inbound = syntheticMessage(row.text, 2, 'customer');
  const signal = AbortSignal.timeout(timeoutMs);
  let chatErrorCode: string | null = null;
  const originalChat = model.chat;
  model.chat = async (input) => {
    // Keep core's normal provider and usage logic. Attribute this standalone script's
    // synthetic calls to no business or conversation, as with the core OpenAI smoke.
    if (input.usage.turnId !== `${runId}:${row.id}`) throw new Error('Unexpected benchmark model call');
    try {
      return await originalChat({ ...input, usage: { ...input.usage, businessId: null, conversationId: null } });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      chatErrorCode = typeof code === 'string' ? code : 'UNEXPECTED_CHAT_ERROR';
      throw error;
    }
  };
  const started = performance.now();
  try {
    const result = await classifyIntent({
      businessId: syntheticBusinessId, conversationId: syntheticConversationId, turnId: `${runId}:${row.id}`,
      history: [...prior, inbound], inbound, offerPending: row.offerPending === true, timeoutMs, signal,
    });
    const declined = row.offerPending && replyToStaffOffer(row.text) === 'declined';
    const handoff = result.source === 'classifier'
      ? !declined && result.label === 'ESCALATION' && (result.confidence ?? 0) >= classifierThreshold
      : null;
    return {
      id: row.id, language: row.language, expectedHandoff: row.expectedHandoff, handoff,
      label: result.label, confidence: result.confidence, source: result.source,
      wallMs: Math.round(performance.now() - started), providerMs: result.response?.latencyMs ?? null,
      timeout: result.source === 'fallback' && signal.aborted,
      chatErrorCode, finishReason: result.response?.finishReason ?? null,
      usage: result.response?.usage ?? null,
    };
  } finally {
    model.chat = originalChat;
  }
}

function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.ceil(ordered.length * fraction) - 1] : null;
}

type Scored = Awaited<ReturnType<typeof score>>;
function summarize(rows: Scored[]) {
  const successful = rows.filter(({ handoff }) => handoff !== null);
  const latencies = successful.map(({ wallMs }) => wallMs);
  const providerLatencies = successful.flatMap(({ providerMs }) => providerMs === null ? [] : [providerMs]);
  const usages = rows.flatMap(({ usage }) => usage ? [usage] : []);
  const knownCosts = usages.flatMap(({ costUsdMicros }) => costUsdMicros === null ? [] : [costUsdMicros]);
  return {
    samples: rows.length, expectedHandoffs: rows.filter(({ expectedHandoff }) => expectedHandoff).length,
    classified: successful.length,
    missedHandoffs: successful.filter(({ expectedHandoff, handoff }) => expectedHandoff && !handoff).length,
    unnecessaryHandoffs: successful.filter(({ expectedHandoff, handoff }) => !expectedHandoff && handoff).length,
    fallback: rows.length - successful.length,
    unresolvedExpectedHandoffs: rows.filter(({ expectedHandoff, handoff }) => expectedHandoff && handoff === null).length,
    timeouts: rows.filter(({ timeout }) => timeout).length,
    chatErrors: rows.filter(({ chatErrorCode }) => chatErrorCode !== null).length,
    p50Ms: percentile(latencies, 0.50), p95Ms: percentile(latencies, 0.95),
    providerP50Ms: percentile(providerLatencies, 0.50), providerP95Ms: percentile(providerLatencies, 0.95),
    usageRowsReturned: usages.length,
    inputTokens: usages.reduce((total, usage) => total + (usage.inputTokens ?? 0), 0),
    outputTokens: usages.reduce((total, usage) => total + (usage.outputTokens ?? 0), 0),
    cachedInputTokens: usages.reduce((total, usage) => total + (usage.cachedInputTokens ?? 0), 0),
    cacheWriteTokens: usages.reduce((total, usage) => total + (usage.cacheWriteTokens ?? 0), 0),
    pricedResponses: knownCosts.length,
    trackedCostUsdMicros: knownCosts.length ? knownCosts.reduce((a, b) => a + b, 0) : null,
  };
}

async function main() {
  const regex = fixture.flatMap((row) => {
    const fast = fastPath(row);
    if ((fast ? 'regex' : 'classifier') !== row.expectedPath) throw new Error(`Unexpected scorer path: ${row.id}`);
    return fast ? [{ id: row.id, language: row.language, expectedHandoff: row.expectedHandoff, ...fast }] : [];
  });
  const eligible = fixture.filter(({ expectedPath }) => expectedPath === 'classifier');
  if (!process.argv.includes('--baseline')) {
    console.log(JSON.stringify({ regex, eligible: eligible.map(({ id }) => id) }, null, 2));
    return;
  }

  const dbName = new URL(dbUrl()).pathname.slice(1);
  const base = config.OPENAI_BASE_URL ? new URL(config.OPENAI_BASE_URL) : null;
  if (config.NODE_ENV !== 'development' || config.LANE !== 'B2' || config.MODEL_MODE !== 'openai' ||
      !['nless_hack_b2', 'nless_hack_b2_test'].includes(dbName) ||
      (base && (base.origin !== 'https://api.openai.com' || base.username || base.password || !/^\/v1\/?$/.test(base.pathname)))) {
    throw new Error('Live smoke needs B2 development config and the official OpenAI API');
  }
  const catalog = await db.one<{ name: string; metering: boolean }>(
    "SELECT current_database() AS name, to_regclass('public.model_usage') IS NOT NULL AS metering",
  );
  if (catalog.name !== dbName || !catalog.metering) throw new Error('B2 benchmark needs existing core metering');

  const started = performance.now();
  const scored: Scored[] = [];
  for (const row of eligible) {
    const result = await score(row);
    scored.push(result);
    if (result.chatErrorCode === 'PROVIDER_BUDGET_EXHAUSTED') break;
  }
  console.log(JSON.stringify({
    runId, model: config.OPENAI_CHAT_MODEL_FAST, threshold: classifierThreshold, timeoutMs,
    fixtureSize: fixture.length, eligible: eligible.length, elapsedMs: Math.round(performance.now() - started),
    regex, scored, summary: {
      all: summarize(scored), th: summarize(scored.filter(({ language }) => language === 'th')),
      en: summarize(scored.filter(({ language }) => language === 'en')),
    },
  }, null, 2));
}

await main().catch((error) => {
  console.error('Benchmark stopped before completion', (error as { code?: string }).code ?? (error as Error).name);
  process.exitCode = 1;
}).finally(closeDb);
