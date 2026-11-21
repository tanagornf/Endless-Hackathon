import { AppError } from '../../core';
import type { MetricsRange } from '@nless/shared/core/types';
import type { FollowUpMetrics } from '@nless/shared/features/follow-ups/types';


export async function getFollowUpMetrics(businessId: string, range: MetricsRange): Promise<FollowUpMetrics> {
  return { scheduled: 0, sent: 0, cancelled: 0, recovered: 0 };
}
