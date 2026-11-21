import { z } from 'zod';

const Title = z.string().max(255);
const Body = z.string().max(20000);
const Kind = z.enum(['faq', 'article']);
const Revision = z.number().int().min(1);
const Uuid = z.string().uuid();

export const ListQuery = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(['draft', 'reviewed', 'active', 'inactive']).optional(),
  includeDeleted: z.stringbool().default(false),
  pendingWebSuggestions: z.stringbool().optional(),
  kind: Kind.optional(),
  folderId: z.union([Uuid, z.literal('unfiled')]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const RevisionQuery = ListQuery.pick({ cursor: true, limit: true });
export const CreateBody = z.object({
  kind: Kind.default('article'),
  title: Title.default(''),
  body: Body.default(''),
  folderId: Uuid.nullable().default(null),
}).strict();

export const ExpectedRevision = z.object({ expectedRevision: Revision }).strict();
export const ActivateBody = ExpectedRevision.extend({ acknowledgeModeration: z.boolean().default(false) });
export const PatchBody = ExpectedRevision.extend({
  kind: Kind.optional(),
  title: Title.optional(),
  body: Body.optional(),
  folderId: Uuid.nullable().optional(),
  files: z.array(z.object({
    fileId: Uuid,
    description: z.string().max(300),
    sendToUser: z.boolean(),
  }).strict()).max(10).optional(),
}).refine((value) => Object.keys(value).length > 1, 'nothing to change');

export type ListQuery = z.infer<typeof ListQuery>;
export type RevisionQuery = z.infer<typeof RevisionQuery>;
export type CreateBody = z.infer<typeof CreateBody>;
export type PatchBody = z.infer<typeof PatchBody>;
export type ActivateBody = z.infer<typeof ActivateBody>;
