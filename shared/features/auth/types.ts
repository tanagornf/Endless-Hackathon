export interface LoginInput {
  email: string;
  password: string;
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
