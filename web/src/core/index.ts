import type { FeaturePages } from '@nless/shared/core/loader';

export function defineFeaturePages(value: FeaturePages): FeaturePages { return value; }

export { api, apiRequest } from './api';
export type { ApiRequestOptions } from './api';
export { useSession, useCan } from './session';
export { useRealtime } from './realtime';
export { useSlot } from './slots';
export { formatMoney, formatDateTime } from './format';
export { PageHeader } from './layout/PageHeader';
export { PlaceholderPage } from './pages/PlaceholderPage';
export { RequirePermission } from './RequirePermission';
export * from './ui';
export type * from './types';
