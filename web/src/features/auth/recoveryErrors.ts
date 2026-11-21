import type { ApiFailure } from '@nless/shared/core/types';

export function recoveryPasswordError(error: ApiFailure['error'] | undefined): string | undefined {
  const issues = error?.details?.issues;
  if (!Array.isArray(issues)) return undefined;
  const issue = issues.find((value) => value?.path === 'newPassword' || value?.path?.[0] === 'newPassword');
  switch (issue?.code) {
    case 'too_short': return 'password.error.too_short';
    case 'too_big':
    case 'too_long': return 'password.error.too_long';
    case 'common': return 'password.error.common';
    case 'same_as_email': return 'password.error.same_as_email';
    default: return undefined;
  }
}
