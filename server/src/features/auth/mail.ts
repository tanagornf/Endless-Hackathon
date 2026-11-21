import { z } from 'zod';
import { AppError, config, encryptSecret, log } from '../../core';
import type { DbExecutor } from '../../core';

const mailSchema = z.object({
  to: z.string().trim().email().max(200),
  userId: z.uuid().nullish(),
  template: z.enum(['verify_email', 'reset_password', 'invitation']),
  locale: z.enum(['th', 'en']),
  vars: z.record(z.string(), z.string().min(1).max(300)),
  actionUrl: z.url().max(2048),
}).strict();

export type SandboxEmailInput = z.input<typeof mailSchema>;

const templates = {
  verify_email: {
    variables: ['name', 'minutes'],
    th: { subject: 'ยืนยันอีเมลสำหรับ Endless', body: 'สวัสดี {{name}} กดลิงก์เพื่อยืนยันอีเมลนี้ ลิงก์ใช้ได้ {{minutes}} นาทีและใช้ได้ครั้งเดียว' },
    en: { subject: 'Confirm your email for Endless', body: 'Hi {{name}}, open the link to confirm this email. It works for {{minutes}} minutes and only once.' },
  },
  reset_password: {
    variables: ['minutes'],
    th: { subject: 'ตั้งรหัสผ่านใหม่ของ Endless', body: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดลิงก์เพื่อตั้งรหัสใหม่ ลิงก์ใช้ได้ {{minutes}} นาทีและใช้ได้ครั้งเดียว ถ้าไม่ได้ขอ ไม่ต้องทำอะไร' },
    en: { subject: 'Reset your Endless password', body: 'A password reset was requested for this account. Open the link to choose a new password. It works for {{minutes}} minutes and only once. If you did not ask for it, ignore this email.' },
  },
  invitation: {
    variables: ['business', 'inviter', 'when'],
    th: { subject: 'คุณได้รับเชิญเข้าร่วม {{business}} บน Endless', body: '{{inviter}} เชิญคุณเป็นพนักงานของ {{business}} กดลิงก์เพื่อรับคำเชิญ ลิงก์ใช้ได้ถึง {{when}} และใช้ได้ครั้งเดียว' },
    en: { subject: 'You are invited to {{business}} on Endless', body: '{{inviter}} invited you to join {{business}} as staff. Open the link to accept. It works until {{when}} and only once.' },
  },
};

function render(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{([a-z]+)\}\}/g, (_, name: string) => vars[name]);
}

export async function insertSandboxMail(input: SandboxEmailInput, executor: DbExecutor) {
  const parsed = mailSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid sandbox email');
  const mail = parsed.data;
  const url = new URL(mail.actionUrl);
  const allowedOrigins = [config.APP_BASE_URL, config.PUBLIC_BASE_URL, config.WEB_ORIGIN]
    .flatMap((base) => base ? [new URL(base).origin] : []);
  const template = templates[mail.template];
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowedOrigins.includes(url.origin)
      || template.variables.some((name) => !Object.hasOwn(mail.vars, name))) {
    throw new AppError('VALIDATION_ERROR', 'Invalid sandbox email');
  }
  const copy = template[mail.locale];
  const row = await executor.one<{ id: string }>(
    `INSERT INTO email_outbox (to_email, user_id, template, locale, subject, body_text, action_url_enc, expires_at)
     VALUES ($1, (SELECT id FROM users WHERE id = $2 FOR KEY SHARE), $3, $4, $5, $6, $7, now() + interval '24 hours')
     RETURNING id`,
    [mail.to, mail.userId ?? null, mail.template, mail.locale, render(copy.subject, mail.vars),
      render(copy.body, mail.vars), encryptSecret(mail.actionUrl)],
  );
  log.debug({ template: mail.template, outboxId: row.id }, 'Sandbox email queued');
  return { outboxId: row.id, delivery: 'email_sandbox' as const };
}
