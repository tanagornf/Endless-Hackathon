import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import type { FeatureId, FolderSlug } from '@nless/shared/core/features';
import type { ApiFailure, AuthUser, BusinessRecord, ErrorCode } from '@nless/shared/core/types';
import type { ComponentType as ReactComponent } from 'react';

/** `() => import('./SomePage')` — every page/slot component is lazy so the 26 feature folders code-split. */
export type LazyComponent<P = object> = () => Promise<{ default: ReactComponent<P> }>;

export type MenuGroup = 'home' | 'chat' | 'customers' | 'knowledge' | 'ai' | 'live' | 'insights' | 'commerce' | 'settings' | 'help' | 'admin';

export interface PageRoute {
  /** Must start with one of this feature's FEATURES[].webPaths. React Router v7 pattern. */
  path: string;
  load: LazyComponent;
  /** 'app' = shell with sidebar (default) · 'bare' = full screen (live presentation) · 'public' = no session (e.g. the F14 customer payment page). */
  layout?: 'app' | 'bare' | 'public';
  /** Default 'business' (needs a selected business). */
  auth?: 'none' | 'user' | 'business' | 'platform_admin';
  /** Missing permission → core renders Forbidden. The API still enforces it (UI hiding is a convenience). */
  permission?: PermissionKey;
  /** i18n key for the browser title, e.g. 'catalog:page.title'. */
  titleKey?: string;
}

export interface MenuEntry {
  path: string;
  /** '<slug>:<key>' in the feature's own namespace, e.g. 'catalog:menu.title'. */
  labelKey: string;
  group: MenuGroup;
  /** @mui/icons-material export name, e.g. 'Inventory2Outlined'. Core maps it; unknown → generic icon. */
  icon: string;
  /** Sort inside the group (10, 20, …). */
  order: number;
  permission?: PermissionKey;
  platformAdminOnly?: boolean;
  /** Show in the mobile bottom tab bar (max 4 across the app; core picks the lowest order). */
  mobileTab?: boolean;
  /** Extra words for sidebar search (Thai + English). */
  searchTerms?: string[];
}

/**
 * Slots let one host page render pieces from other lanes without editing the host's files.
 * Host owners: businessTabs → F04 '/business' (C3) · accountTabs, topbarActions, oauthCallbacks → core (C1)
 * · chatSidePanels, chatComposerActions, chatMessageActions → F09 '/chat' (A1) · channelCards → F17 '/channels' (C2)
 * · dashboardCards → F27 '/dashboard' (B3) · knowledgeActions → F05 '/knowledge' (B1).
 */
export type SlotName =
  | 'businessTabs'
  | 'accountTabs'
  | 'topbarActions'
  | 'oauthCallbacks'
  | 'chatSidePanels'
  | 'chatComposerActions'
  | 'chatMessageActions'
  | 'channelCards'
  | 'dashboardCards'
  | 'knowledgeActions';

export interface SlotContribution {
  slot: SlotName;
  /** Unique within the slot, e.g. 'orders.chat-panel'. */
  id: string;
  labelKey?: string;
  order: number;
  permission?: PermissionKey;
  /** Props passed by the host, e.g. { conversationId } for chat slots, { businessId } for businessTabs. */
  load: LazyComponent<Record<string, unknown>>;
  /** oauthCallbacks only: OAuth `state` prefix this handler owns, e.g. 'gcal:' (F16), 'gdocs:' (F06), 'meta:' (F18). */
  statePrefix?: string;
}

/** What web/src/features/<slug>/pages.tsx default-exports. i18n: web/src/features/<slug>/i18n/{th,en}.json, namespace = slug. */
export interface FeaturePages {
  featureId: FeatureId;
  slug: FolderSlug;
  routes: PageRoute[];
  menu?: MenuEntry[];
  slots?: SlotContribution[];
}

export interface WebApiError extends Error {
  status: number;
  code: ErrorCode;
  retryable: boolean;
  details?: Record<string, unknown>;
  /**
   * The ApiFailure body as received. No JSON body → synthesized: network error = status 0, code 'SERVICE_NOT_READY',
   * retryable true · other HTTP status = code 'INTERNAL', retryable status ≥ 500 · meta.requestId '' when unknown.
   * useApiQuery / useApiMutation expose this as `error`.
   */
  failure: ApiFailure;
}

/**
 * fetch wrapper: base VITE_API_BASE ('/api/v1'), credentials 'include', header X-Requested-With: nless,
 * unwraps ApiResult.data, throws WebApiError built from ApiFailure. 401 → redirect to /login (keeps drafts).
 */
export interface WebApiClient {
  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
  upload<T>(path: string, form: FormData): Promise<T>;
  /** '/catalog/items' → '/businesses/<current business id>/catalog/items'. */
  biz(path: string): string;
}

export interface SessionState {
  status: 'loading' | 'anonymous' | 'ready';
  user: AuthUser | null;
  businesses: { business: BusinessRecord; role: MembershipRole; permissions: PermissionKey[] }[];
  currentBusiness: BusinessRecord | null;
  permissions: PermissionKey[];
  selectBusiness(businessId: string): void;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}
