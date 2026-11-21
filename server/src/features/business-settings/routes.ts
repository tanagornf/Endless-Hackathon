import { defineFeatureRoutes } from '../../core';
import { ownerConsultSchedule } from './owner-consult-outbox';
import { ownerConsultAnswerSchedule } from './owner-consult-answer-outbox';
import { registerOwnerConsultRoutes } from './owner-consult-routes';
import { AiSwitchBody, CapabilitiesBody, ClosureBody, ClosuresQuery, HoursBody, LocaleBody, OpenStateQuery, PolicyPatchBody, ProfileBody, parseSettingsInput } from './schemas';
import {
  createClosure, deleteClosure, getBusinessOpenState, getSettingsView, listClosures, patchAnswerPolicy, setAiEnabled, updateCapabilities, updateHours, updateLocale, updateProfile,
} from './service';

const settingsPath = '/businesses/:businessId/settings';
const settingsRead = { auth: 'business', permission: 'business.read' } as const;
const settingsWrite = { auth: 'business', permission: 'business.update' } as const;
const botSettingsWrite = { auth: 'business', permission: 'business.bot_settings' } as const;

export default defineFeatureRoutes({
  featureId: 'F04',
  slug: 'business-settings',
  schedules: [ownerConsultSchedule, ownerConsultAnswerSchedule],
  register(api) {
    registerOwnerConsultRoutes(api);
    api.get(settingsPath, { ...settingsRead, summary: 'Read business settings' },
      async ({ business }) => getSettingsView(business!.id));
    api.put(settingsPath + '/ai', {
      auth: 'business', permission: 'business.bot_settings', summary: 'Set the business AI switch',
    }, async ({ body, business, user }) => {
      const { enabled } = parseSettingsInput(AiSwitchBody, body);
      return setAiEnabled(business!.id, enabled, user!.id);
    });
    api.patch(settingsPath + '/answer-policy', { ...botSettingsWrite, summary: 'Patch customer answer policy' },
      async ({ body, business, user }) => {
        const input = parseSettingsInput(PolicyPatchBody, body);
        return patchAnswerPolicy(business!.id, user!.id, input.expectedVersion, input.policy);
      });
    api.put(settingsPath + '/capabilities', { ...botSettingsWrite, summary: 'Set merchant capabilities' },
      async ({ body, business, user }) => {
        const input = parseSettingsInput(CapabilitiesBody, body);
        return updateCapabilities(business!.id, user!.id, input.expectedVersion, input.capabilities);
      });
    api.put(settingsPath + '/profile', { ...settingsWrite, summary: 'Set the business profile' },
      async ({ body, business, user }) => {
        const { expectedVersion, ...profile } = parseSettingsInput(ProfileBody, body);
        return updateProfile(business!.id, user!.id, expectedVersion, profile);
      });
    api.put(settingsPath + '/locale', { ...settingsWrite, summary: 'Set the default language and business timezone' },
      async ({ body, business, user }) => {
        const input = parseSettingsInput(LocaleBody, body);
        return updateLocale(business!.id, user!.id, input.expectedVersion, input.timezone, input.language);
      });
    api.put(settingsPath + '/hours', { ...settingsWrite, summary: 'Set weekly opening hours' },
      async ({ body, business, user }) => {
        const input = parseSettingsInput(HoursBody, body);
        return updateHours(business!.id, user!.id, input.hours, input.expectedVersion);
      });
    api.get(settingsPath + '/closures', { ...settingsRead, summary: 'List special closures' },
      async ({ query, business }) => {
        const { scope } = parseSettingsInput(ClosuresQuery, query);
        return { items: await listClosures(business!.id, scope) };
      });
    api.post(settingsPath + '/closures', { ...settingsWrite, summary: 'Add a special closure' },
      async ({ body, business, user }) => {
        const input = parseSettingsInput(ClosureBody, body);
        return { kind: 'json', status: 201, data: await createClosure(business!.id, user!.id, input) };
      });
    api.delete(settingsPath + '/closures/:closureId', { ...settingsWrite, summary: 'Delete a special closure' },
      async ({ params, business, user }) => {
        await deleteClosure(business!.id, user!.id, params.closureId!);
        return { kind: 'no_content' };
      });
    api.get(settingsPath + '/open-state', { ...settingsRead, summary: 'Read current or future business opening state' },
      async ({ query, business }) => {
        const { at } = parseSettingsInput(OpenStateQuery, query);
        return getBusinessOpenState(business!.id, at);
      });
  },
});
