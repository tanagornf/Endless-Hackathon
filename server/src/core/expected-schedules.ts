import type { FeatureId } from '@nless/shared/core/features';

interface ExpectedSchedule {
  name: string;
  everySeconds: number;
  ownerFeature: FeatureId;
  status: 'declared' | 'planned';
  optional?: boolean;
}

export const EXPECTED_SCHEDULES: readonly ExpectedSchedule[] = [
  { name: 'core.sessions.purge', everySeconds: 3600, ownerFeature: 'F01', status: 'declared' },
  { name: 'core.jobs.purge', everySeconds: 3600, ownerFeature: 'F35', status: 'declared' },
  { name: 'team.idle-scan', everySeconds: 60, ownerFeature: 'F11', status: 'declared' },
  { name: 'team.auto-close', everySeconds: 300, ownerFeature: 'F11', status: 'declared', optional: true },
  { name: 'voice.sweep', everySeconds: 30, ownerFeature: 'F30', status: 'declared' },
  { name: 'follow-ups.scan', everySeconds: 60, ownerFeature: 'F38', status: 'declared' },
  { name: 'follow-ups.recover', everySeconds: 300, ownerFeature: 'F38', status: 'declared' },
  { name: 'auth.outbox-purge', everySeconds: 3600, ownerFeature: 'F02', status: 'declared' },
  { name: 'notifications.purge', everySeconds: 86400, ownerFeature: 'F31', status: 'declared' },
  { name: 'payments.expire', everySeconds: 600, ownerFeature: 'F14', status: 'declared' },
  { name: 'knowledge-search.reconcile', everySeconds: 600, ownerFeature: 'F07', status: 'declared', optional: true },
  { name: 'knowledge.purge-drafts', everySeconds: 86400, ownerFeature: 'F05', status: 'declared', optional: true },
  { name: 'orders.sweep', everySeconds: 600, ownerFeature: 'F13', status: 'declared' },
  { name: 'live-commerce.sweep', everySeconds: 600, ownerFeature: 'F22', status: 'declared' },
  { name: 'booking.maintain', everySeconds: 300, ownerFeature: 'F15', status: 'declared' },
  { name: 'booking.repair', everySeconds: 120, ownerFeature: 'F15', status: 'declared' },
  { name: 'calendar.repair', everySeconds: 600, ownerFeature: 'F16', status: 'declared' },
  { name: 'calendar.maintain', everySeconds: 3600, ownerFeature: 'F16', status: 'declared' },
  { name: 'crm.automation', everySeconds: 900, ownerFeature: 'F24', status: 'declared' },
  { name: 'insights.scan', everySeconds: 120, ownerFeature: 'F26', status: 'declared' },
  { name: 'knowledge-import.sweep', everySeconds: 600, ownerFeature: 'F06', status: 'declared' },
  { name: 'line.maintenance', everySeconds: 600, ownerFeature: 'F17', status: 'declared' },
  { name: 'meta.maintenance', everySeconds: 600, ownerFeature: 'F18', status: 'declared' },
  { name: 'comments.reconcile', everySeconds: 300, ownerFeature: 'F21', status: 'declared' },
];
