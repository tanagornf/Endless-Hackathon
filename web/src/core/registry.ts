import { registerPreparedScreens } from '../integration/register';
import { FEATURES } from '@nless/shared/core/features';
import type { FeaturePages } from '@nless/shared/core/loader';

const modules = Object.entries(import.meta.glob<{ default: FeaturePages }>('../features/*/pages.tsx', { eager: true }));
const prefixes = FEATURES.flatMap((feature) => feature.webPaths.map((path) => ({ id: feature.id, path })))
  .sort((a, b) => b.path.length - a.path.length);
const seen = new Set<string>();
export const registryErrors: string[] = [];
export const featurePages = modules.flatMap(([file, { default: pages }]) => {
  const slug = /\/features\/([^/]+)\//.exec(file)?.[1];
  const feature = FEATURES.find((row) => row.slug === slug);
  if (!feature?.folder || pages.slug !== slug || pages.featureId !== feature.id) {
    registryErrors.push('Invalid pages registration for ' + slug);
    return [];
  }
  const integrated = registerPreparedScreens(pages);
  return [{
    ...integrated,
    routes: integrated.routes.filter(({ path }) => {
      const owner = prefixes.find((prefix) => path === prefix.path || path.startsWith(prefix.path + '/'));
      if (owner?.id !== feature.id || seen.has(path)) {
        registryErrors.push('Invalid or duplicate path ' + path);
        return false;
      }
      seen.add(path);
      return true;
    }),
  }];
});
