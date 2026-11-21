import type { FeaturePages, MenuEntry, PageRoute } from '@nless/shared/core/loader';
import { screens } from './screens';

const load = () => import('./PreparedPage');
/** Lane-owned screens always win. Only generated scaffold loaders carry this marker. */
export function registerPreparedScreens(lane: FeaturePages): FeaturePages {
  const planned = screens.filter(screen => screen.id === lane.featureId);
  const routes = [...lane.routes];
  const menu = [...lane.menu ?? []];
  for (const [index, screen] of planned.entries()) {
    const existing = routes.findIndex(route => route.path === screen.path);
    const scaffold = existing >= 0 && 'endlessScaffold' in routes[existing].load;
    const titleKey = 'integration:page.' + screen.key + '.title';
    const route: PageRoute = { path: screen.path, auth: screen.auth, layout: screen.layout, permission: screen.permission, titleKey, load };
    if (existing < 0) routes.push(route);
    else if (scaffold) routes[existing] = route;
    if (!screen.group) continue;
    const item: MenuEntry = { path: screen.path, group: screen.group, icon: screen.icon ?? 'Extension', labelKey: titleKey,
      order: (index + 1) * 10, permission: screen.permission, platformAdminOnly: screen.auth === 'platform_admin',
      mobileTab: ['inbox','orders','customers','dashboard'].includes(screen.key) };
    const position = menu.findIndex(entry => entry.path === screen.path);
    if (position < 0 && (existing < 0 || scaffold)) menu.push(item);
    else if (scaffold && position >= 0) menu[position] = { ...item, order: menu[position].order };
  }
  return { ...lane, menu, routes };
}
