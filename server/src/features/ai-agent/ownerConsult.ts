import { detectTextLanguage } from '@nless/shared/core/language';
import { z } from 'zod';
import type { JobHandler } from '../../core';
import { sendToCustomer } from '../../core';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { getConversation, getHistory } from '../inbox/service';
import { isAiAllowed } from './gate';
import { inspectReply } from './guards';
import { maskCardNumbers } from './mask';

export const OWNER_CONSULT_RESUME_JOB = 'ai.owner_consult.resume';

const resumePayload = z.strictObject({
  businessId: z.uuid(),
  caseId: z.uuid(),
  actionStepId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  answerReceiptId: z.uuid(),
});

const committedAnswer = z.object({
  conversationId: z.uuid(),
  triggerMessageId: z.uuid(),
  answer: z.string().trim().min(1).max(2000),
  language: z.enum(['th', 'en']),
  reuse: z.enum(['case_only', 'propose_draft']),
  version: z.number().int().min(2),
});

type ResumePayload = z.infer<typeof resumePayload>;
type CommittedAnswer = z.infer<typeof committedAnswer>;

// F04 must bind this lookup to the current answered step and exact receipt in the requested tenant.
type ReadOwnerConsultAnswer = (key: ResumePayload) => Promise<CommittedAnswer | null>;

export function createOwnerConsultResumeHandler(readOwnerConsultAnswer: ReadOwnerConsultAnswer): JobHandler<ResumePayload> {
  return async ({ businessId, payload, signal }) => {
    const key = resumePayload.safeParse(payload);
    if (!key.success || businessId !== key.data.businessId || signal.aborted) return;

    const receipt = committedAnswer.safeParse(await readOwnerConsultAnswer(key.data));
    if (!receipt.success || signal.aborted) return;

    const { conversationId, triggerMessageId, answer, language } = receipt.data;
    if (maskCardNumbers(answer) !== answer) return;
    const scope = { businessId };
    const conversation = await getConversation(conversationId, scope);
    if (conversation?.id !== conversationId || conversation.businessId !== businessId || conversation.channel !== 'line' ||
        conversation.status !== 'open' || conversation.handler !== 'ai' || conversation.assigneeUserId !== null) return;

    const { items: history } = await getHistory(conversationId, { ...scope, limit: 24 });
    const trigger = history.findLast(({ direction, author }) => direction === 'inbound' && author === 'customer');
    if (trigger?.id !== triggerMessageId || trigger.businessId !== businessId || trigger.conversationId !== conversationId ||
        trigger.channel !== 'line' || history.some(({ seq, author, direction }) => seq > trigger.seq && author === 'staff' && direction === 'outbound')) return;

    // A case answer is not catalog, pricing, contact, or URL evidence. This guard makes no model calls.
    const checked = inspectReply(answer, {
      language,
      unanswered: [trigger.text],
      rules: await getEffectiveAnswerRules(businessId),
      knowledge: [], prices: [], totals: [], tools: [], messages: [], contact: '', cardMasked: false, shopOpen: null,
      catalogRequest: { text: trigger.text, skus: [], previousSkus: [], linkedSameProduct: false },
    });
    if (!checked.text || checked.violations.length || checked.actions.some(({ guard }) => guard !== 'markdown')) return;
    const shortReplyLanguage = checked.text.length <= 20 ? detectTextLanguage(checked.text) : null;
    if (shortReplyLanguage && shortReplyLanguage !== language) return;

    const current = await getConversation(conversationId, scope);
    if (current?.version !== conversation.version || current?.lastInboundAt !== conversation.lastInboundAt ||
        current.status !== 'open' || current.handler !== 'ai' || current.assigneeUserId !== null) return;
    const gate = await isAiAllowed(current, trigger, history, 'reply');
    if (!gate.allowed || signal.aborted) return;

    // Core reuses the saved outbound message and its canonical delivery job when an enqueue is retried.
    await sendToCustomer(conversationId, [{ type: 'text', text: checked.text }], {
      ...scope,
      author: 'ai',
      clientRequestId: 'ai.owner_consult.resume:' + key.data.answerReceiptId,
    });
  };
}
