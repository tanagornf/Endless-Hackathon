import { AppError } from '../../core';
import type { TemplateVars } from '@nless/shared/features/message-templates/types';
import type { MessagePart } from '@nless/shared/core/types';

/**
 * @owner F12 message-templates · A1 · consumers: A1 broadcast, C2 comments, A2 orders, B2
 * Renders a saved template to MessagePart[]. Missing template, or opts.businessId given and the template
 * belongs to another business → NOT_FOUND (it is a mutation input, so it throws).
 * @fake SEED.templates by id: one TextPart with `{{key}}` replaced from vars.
 */
export async function renderTemplate(templateId: string, vars: TemplateVars, opts?: { businessId?: string }): Promise<MessagePart[]> {
  throw new AppError("SERVICE_NOT_READY", "renderTemplate is not implemented");
}
