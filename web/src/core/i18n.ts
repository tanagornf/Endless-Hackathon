import i18n from 'i18next';
import type { Resource } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

const resources: Resource = { th: {}, en: {} };
const core = import.meta.glob('./i18n/*/*.json', { eager: true, import: 'default' });
for (const [path, data] of Object.entries(core)) {
  const match = /\/i18n\/(th|en)\/([^/]+)\.json$/.exec(path);
  if (match) resources[match[1]][match[2]] = data as Record<string, string>;
}
const features = import.meta.glob('../features/*/i18n/*.json', { eager: true, import: 'default' });
for (const [path, data] of Object.entries(features)) {
  const match = /\/features\/([^/]+)\/i18n\/(th|en)\.json$/.exec(path);
  if (match) resources[match[2]][match[1]] = data as Record<string, string>;
}

i18n.on('languageChanged', (lang) => { if (typeof document !== 'undefined') document.documentElement.lang = lang; });
export const i18nReady = i18n.use(LanguageDetector).use(initReactI18next).init({
  resources, fallbackLng: 'th', supportedLngs: ['th', 'en'], load: 'languageOnly', defaultNS: 'common',
  interpolation: { escapeValue: false }, detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'nless.lang', caches: ['localStorage'] },
});
export default i18n;
