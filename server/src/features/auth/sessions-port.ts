import { revokeUserSessions } from '../../core';

export function revokeAllSessions(userId: string): Promise<number> {
  return revokeUserSessions(userId);
}
