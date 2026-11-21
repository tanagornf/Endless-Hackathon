import type { ApiFailure } from '@nless/shared/core/types';

export function apiFailure(error: unknown): ApiFailure | null {
  return error instanceof Error && 'failure' in error ? error.failure as ApiFailure : null;
}

export function issueAt(failure: ApiFailure | null, path: string): string | undefined {
  const issues = failure?.error.details?.issues;
  if (!Array.isArray(issues)) return undefined;
  return issues.find((issue) =>
    typeof issue?.path === 'string' && (issue.path === path || issue.path.startsWith(path + '.')),
  )?.code;
}
