import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F30',
  slug: 'voice',
  routes: [
    { path: '/call', layout: 'public', auth: 'none', titleKey: 'voice:page.title', load: () => import('./VoiceCallPage') },
  ],
});
