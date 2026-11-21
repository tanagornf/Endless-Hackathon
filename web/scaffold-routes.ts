import type { Plugin } from 'vite';

/** Identify the loader emitted by scripts/scaffold-features.ts before Vite rewrites imports.
 * A real page, including a new lane page without a titleKey, retains its original loader and guards. */
export function markScaffoldRoutes(): Plugin {
  return {
    name: 'endless-generated-placeholder', enforce: 'pre',
    transform(code, id) {
      if (!/\/features\/[^/]+\/pages\.tsx$/.test(id.replaceAll('\\', '/'))) return;
      const generated = /\(\s*\)\s*=>\s*import\(\s*(['"])\.\/Placeholder\1\s*\)/g;
      const output = code.replace(generated, loader => 'Object.assign(' + loader + ', { endlessScaffold: true })');
      return output !== code ? { code: output, map: null } : undefined;
    },
  };
}
