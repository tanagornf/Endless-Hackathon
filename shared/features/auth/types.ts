export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput extends LoginInput {
  displayName: string;
  locale: 'th' | 'en';
  businessName?: string;
  inviteToken?: string;
}

export interface AuthResult {
  userId: string;
  emailVerified: boolean;
  next: string;
}

export interface AuthStatus {
  userId: string;
  email: string;
  displayName: string;
  locale: 'th' | 'en';
  emailVerified: boolean;
  isPlatformAdmin: boolean;
}

export type MailboxScope = 'mine' | 'all';

export interface MailboxItem {
  id: string;
  to: string;
  template: 'verify_email' | 'reset_password' | 'invitation';
  subject: string;
  bodyText: string;
  actionUrl: string;
  createdAt: string;
  expiresAt: string;
  mode: 'sandbox';
}

export interface MailboxResult {
  scope: MailboxScope;
  items: MailboxItem[];
}
