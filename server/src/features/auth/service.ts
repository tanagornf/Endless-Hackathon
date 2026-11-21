import { db } from '../../core';
import { insertSandboxMail } from './mail';
import type { SandboxEmailInput } from './mail';

export const FEATURE = {"id":"F02","slug":"auth","lane":"C3"} as const;

export function queueEmail(input: SandboxEmailInput): Promise<{ outboxId: string; delivery: 'email_sandbox' }> {
  return insertSandboxMail(input, db);
}
