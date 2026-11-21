import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F30',
  routes: [
    { path: '/call', layout: 'public', auth: 'none', titleKey: 'voice:page.title', load: () => import('./VoiceCallPage') },
  ],
});
