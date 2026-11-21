import type { SlotName } from '@nless/shared/core/loader';
import { useFeatures } from './featureFlags';
import { featurePages } from './registry';
import { useSession } from './session';

export function useSlot(slot: SlotName) {
  const { permissions } = useSession();
  const { visible } = useFeatures();
  return featurePages.filter(feature => visible(feature.featureId)).flatMap((feature) => feature.slots ?? []).filter((entry) => entry.slot === slot && (!entry.permission || permissions.includes(entry.permission)))
    .sort((a, b) => a.order - b.order);
}
