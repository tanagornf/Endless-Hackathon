import { AppError, defineFeatureRoutes, requirePermission } from '../../core';
import type { RouteContext } from '../../core';
import { getConversation } from '../inbox/service';
import { assignTag, createTag, deleteTag, setMarketingConsent, unassignTag, updateTag } from './mutations';
import { customerList, detail, missing, tags } from './repo';
import { updateProfile } from './profile';
import { AssignTagBody, CreateTagBody, ListCustomersQuery, SetConsentBody, UpdateProfileBody, UpdateTagBody } from './schemas';

const root = '/businesses/:businessId/crm';
const customers = root + '/customers';
const customer = customers + '/:customerId';
const tagPath = root + '/tags';
const auth = { auth: 'business' } as const;
const tagWrite = { ...auth, permission: 'broadcast.tags' } as const;
const reply = { ...auth, permission: 'chat.reply' } as const;

function allowRead(ctx: RouteContext) {
  const permissions = ctx.scope!.permissions;
  if (!permissions.includes('chat.read') && !permissions.includes('broadcast.read') && !permissions.includes('insights.read')) {
    throw new AppError('PERMISSION_DENIED', 'Customer read permission required');
  }
}
function actor(ctx: RouteContext) {
  return { businessId: ctx.business!.id, actorUserId: ctx.user!.id };
}
export default defineFeatureRoutes({
  featureId: 'F24', slug: 'crm',
  register(api) {
    api.get(customers, { ...auth, query: ListCustomersQuery, summary: 'List customer profiles' }, async ctx => {
      allowRead(ctx);
      return customerList(ctx.business!.id, ctx.query);
    });
    api.get(customer, { ...auth, summary: 'Read customer profile' }, async ctx => {
      allowRead(ctx);
      return detail(ctx.business!.id, ctx.params.customerId);
    });
    api.get(root + '/conversations/:conversationId/panel', { ...auth, permission: 'chat.read', summary: 'Read staff customer panel' }, async ctx => {
      const businessId = ctx.business!.id;
      const conversation = await getConversation(ctx.params.conversationId, { businessId });
      if (!conversation) throw missing();
      const [record, allTags] = await Promise.all([detail(businessId, conversation.customerId), tags(businessId)]);
      return {
        customerId: conversation.customerId,
        detail: record,
        availableTags: allTags.map(({ id, name, color }) => ({ id, name, color })),
        canEditTags: ctx.scope!.permissions.includes('chat.reply'),
        canCreateTags: ctx.scope!.permissions.includes('broadcast.tags'),
        mergeCandidateCount: 0,
      };
    });
    api.get(tagPath, { ...auth, summary: 'List customer tags' }, async ctx => {
      allowRead(ctx);
      return { items: await tags(ctx.business!.id) };
    });
    api.post(tagPath, { ...tagWrite, body: CreateTagBody, summary: 'Create customer tag' }, async ctx =>
      ({ kind: 'json', status: 201, data: await createTag(actor(ctx), ctx.body) }));
    api.patch(tagPath + '/:tagId', { ...tagWrite, body: UpdateTagBody, summary: 'Update customer tag' }, async ctx =>
      updateTag(actor(ctx), ctx.params.tagId, ctx.body));
    api.delete(tagPath + '/:tagId', { ...tagWrite, summary: 'Delete customer tag' }, async ctx => {
      await deleteTag(actor(ctx), ctx.params.tagId);
      return { kind: 'no_content' };
    });
    api.patch(customer + '/profile', { ...reply, body: UpdateProfileBody, summary: 'Update customer contact details' }, async ctx =>
      updateProfile(ctx.business!.id, ctx.params.customerId, ctx.user!.id, ctx.body));
    api.post(customer + '/tags', { ...reply, body: AssignTagBody, summary: 'Assign customer tag' }, async ctx => {
      if ('name' in ctx.body) requirePermission(ctx.scope!, 'broadcast.tags');
      await assignTag(actor(ctx), ctx.params.customerId, ctx.body);
      return detail(ctx.business!.id, ctx.params.customerId);
    });
    api.delete(customer + '/tags/:tagId', { ...reply, summary: 'Remove customer tag' }, async ctx => {
      await unassignTag(actor(ctx), ctx.params.customerId, ctx.params.tagId);
      return detail(ctx.business!.id, ctx.params.customerId);
    });
    api.put(customer + '/consent', { ...auth, body: SetConsentBody, summary: 'Record marketing consent' }, async ctx => {
      requirePermission(ctx.scope!, ctx.body.status === 'revoked' ? 'chat.reply' : 'broadcast.tags');
      if (ctx.body.status === 'granted' && (!ctx.body.attestation || !ctx.body.reason.trim())) throw new AppError('VALIDATION_ERROR', 'Consent attestation and reason required');
      await setMarketingConsent({ ...actor(ctx), customerId: ctx.params.customerId, source: 'staff', status: ctx.body.status, reason: ctx.body.reason });
      return detail(ctx.business!.id, ctx.params.customerId);
    });
  },
});
