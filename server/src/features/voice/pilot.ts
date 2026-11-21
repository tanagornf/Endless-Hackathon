import { config } from '../../core';
import type { VerifiedLineSender } from './invites';

const scopePattern = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):(U[0-9a-f]{32}):(U[0-9a-f]{32})$/;

export function matchesVoicePilot(rule: string | undefined, sender: VerifiedLineSender): boolean {
  const scope = scopePattern.exec(rule ?? '');
  return !!scope && scope[0] === rule && scope[1] === sender.businessId && scope[2] === sender.lineBot && scope[3] === sender.lineUser;
}

export function isVoicePilotAllowed(sender: VerifiedLineSender): boolean {
  return (config.NODE_ENV === 'test' && config.MODEL_MODE === 'fake') ||
    matchesVoicePilot(process.env.F30_LINE_PILOT, sender);
}
