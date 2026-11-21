import { describe, expect, test } from 'vitest';
import { FEATURES } from '@nless/shared/core/features';
import type { FeaturePages } from '@nless/shared/core/loader';
import { registerPreparedScreens } from './register';
import { screens } from './screens';
import en from '../core/i18n/en/integration.json';
import th from '../core/i18n/th/integration.json';

const lane: FeaturePages = {featureId:'F09',slug:'inbox', routes:[], menu:[]};

describe('frontend integration', () => {
  test('prepares every lane-owned feature, plus core operations', () => {
    const covered = new Set(screens.map(s => s.id));
    for (const feature of FEATURES.filter(f => f.folder || f.id === 'F35')) expect(covered.has(feature.id)).toBe(true);
    expect(new Set(screens.map(s => s.path)).size).toBe(screens.length);
  });
  test('all destinations, panels and displayed fields have English and Thai labels', () => {
    for (const locale of [en,th]) {
      for (const s of screens) {
        expect(Object.hasOwn(locale.page,s.key)).toBe(true);
        for (const p of s.panels) {
          expect(Object.hasOwn(locale.tabs,p.label)).toBe(true);
          for (const field of p.fields.split(' ')) expect(Object.hasOwn(locale.field,field.split(':').at(-1)!)).toBe(true);
        }
      }
    }
  });
  test('a lane implementation wins even if it has no titleKey', () => {
    const load = async () => ({default:() => null});
    const routes = [{path:'/chat',load,permission:'chat.reply' as const}];
    const merged = registerPreparedScreens({...lane,routes});
    expect(merged.routes.find(r => r.path === '/chat')).toBe(routes[0]);
    expect(merged.routes.find(r => r.path === '/demo-chat/s/:slug')).toMatchObject({auth:'none',layout:'public'});
    expect(merged.menu!.some(m => m.path.includes(':slug'))).toBe(false);
    expect(routes).toHaveLength(1);
  });
  test('does not restore the retired email verification route in the preview', () => {
    const auth = registerPreparedScreens({featureId:'F02',slug:'auth',routes:[]});
    expect(auth.routes.map(route => route.path)).not.toContain('/verify-email');
  });
  test('replaces a generated scaffold and preserves stricter lane metadata on a real route', () => {
    const load = Object.assign(async () => ({default:() => null}),{endlessScaffold:true});
    const merged = registerPreparedScreens({...lane,routes:[{path:'/chat',load}]});
    const chat = merged.routes.filter(r => r.path === '/chat');
    expect(chat).toHaveLength(1);
    expect(chat[0].load).not.toBe(load);
    expect(chat[0].permission).toBe('chat.read');
    expect(merged.menu?.find(m => m.path === '/chat')?.mobileTab).toBe(true);
  });
  test('release and ops are restricted to platform administrators', () => {
    expect(screens.filter(s => ['release','ops'].includes(s.key)).every(s => s.auth === 'platform_admin')).toBe(true);
  });
});
