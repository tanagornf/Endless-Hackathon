/**
 * contracts.ts — Endless hackathon: cross-lane contract reference (v3, 20 Nov 2026 evening, frozen for 21 Nov 2026)
 * =========================================================================================
 *
 * v2 vs v1: scope cut to 28 features (no plans, no quotas: everything is unlimited), lanes re-split per
 * PLAN.md (20 Nov), channels = web / LINE / Messenger / Instagram, AI = OpenAI API only (core `model.*`,
 * Responses API; source of truth for every model call: docs/openai-api.md).
 * v3 vs v2 (docs/DECISIONS-2026-11-20.md D2, D5, D8, D17): 31 features (adds F37 evals, F38 follow-ups,
 * F39 chatgpt-catalog), one orchestrator lane per person (A0 / B0 / C0) next to the 9 worker lanes,
 * `fix/<owner-lane>/<slug>` branches for orchestrator cross-lane fixes. Build specs: docs/specs/<ID>-<slug>.md.
 *
 * WHAT THIS FILE IS
 *   The single source of truth for every function one lane calls in another lane's code, plus
 *   the auto-loader shapes (routes.ts / pages.tsx / migrations / seed.ts) and the SPEC §5 seed data.
 *   It is a reference, not app code: it has no imports and type-checks standalone
 *   (tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler contracts.ts).
 *   Functions are `declare`d. Their FAKE behavior is written in JSDoc (@fake) and C1 implements it at setup.
 *
 * HOW C1 USES IT AT SETUP (prompts/C1-setup.md)
 *   Each section starts with a banner `// ═══ target: <path> ═══`. C1 splits the file along those
 *   banners into the competition repo:
 *     shared/core/*.ts                      types, permission catalog, feature table, seed fixtures
 *     server/src/core/*                     the core API (exported from server/src/core/index.ts)
 *     web/src/core/types.ts                 WebCore + UI-kit props (React types, so NOT in shared)
 *     shared/features/<slug>/types.ts       each feature's public types
 *     server/src/features/<slug>/service.ts each feature's public functions, body = the @fake behavior
 *   Placeholder types at the top (RequestLike, ComponentLike, SchemaLike, ReactNodeLike) become the real
 *   Express / React / zod types in the competition repo. Names and shapes stay the same.
 *
 * HOW OWNERS USE IT
 *   The owner replaces the fake body in service.ts with the real implementation. The signature
 *   (name, parameters, return type, error behavior) does not change on the day. Need a change?
 *   Post `CHANGE TO:<owner lane>` on the board. Backward-compatible additions (a new optional field
 *   or option) are allowed after the owner posts `DONE CHANGE`.
 *
 * RULES THAT APPLY TO EVERY CONTRACT
 *   R1 async      Every contract function returns a Promise, except requirePermission(),
 *                 requirePlatformAdmin() (F35 ops tools only) and registerChannelSender(), which are synchronous.
 *   R2 errors     Services THROW `AppError(code)` for expected failures (code from ErrorCode, HTTP status
 *                 from ERROR_HTTP_STATUS). They never return ApiFailure and never throw a plain Error
 *                 for an expected case. Only the HTTP layer in core builds ApiResult / ApiFailure.
 *   R3 lookups    `get*` by id returns `null` when the row is missing OR belongs to another business
 *                 (when a businessId is given). It does not throw NOT_FOUND. Mutations on a missing
 *                 row throw AppError('NOT_FOUND').
 *   R4 decisions  "Policy says no" answers that callers branch on are return values, not throws:
 *                 isHumanTakeover(), PriceQuote.soldOut, BusinessSettings.aiEnabled, ModelModerateResult.flagged.
 *   R5 tenancy    Contract functions trust their server-side caller. The tenant check happens at the
 *                 HTTP boundary (getBusiness). Every contract still filters by the businessId it is
 *                 given and never returns another tenant's rows.
 *   R6 money      Integer minor units (THB satang), `currency: 'THB'`. Never floats, never a price
 *                 taken from the browser or from model text.
 *   R7 time       ISO-8601 UTC strings in data. Display in Asia/Bangkok. Tests use CLOCK_FIXTURE.
 *   R8 honesty    A fake that cannot complete a side effect honestly (order, booking, payment, real
 *                 provider send) throws AppError('SERVICE_NOT_READY'). It never fakes success.
 *   R9 imports    Features import core only from `server/src/core` (index.ts) / `web/src/core` (index.ts),
 *                 other features only from `server/src/features/<slug>/service.ts`, types only from
 *                 `@nless/shared/core/*` and `@nless/shared/features/<slug>/types`.
 *
 * Reuses names from docs/competition-plan/02-architecture-contracts.md §5/§8:
 *   AuthScope, ApiResult, ApiFailure, ChatTurnRequest, ChatTurnResult, ConfirmRequest, MessagePart.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ placeholders — replaced by real library types in the competition repo ═══
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Express `Request` in the competition repo. Only these fields are relied on by contracts. */
export interface RequestLike {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  cookies?: Record<string, string>;
}

/** Express `Response` in the competition repo. Only cookie helpers are relied on by contracts. */
export interface ResponseLike {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
  clearCookie(name: string, options?: Record<string, unknown>): unknown;
}

/** A zod schema in the competition repo (`z.ZodType<T>`). Only `.parse()` is relied on. */
export interface SchemaLike<T> {
  parse(input: unknown): T;
}

/** `React.ComponentType<P>` in the competition repo. */
export type ComponentLike<P = object> = (props: P) => unknown;

/** `() => import('./SomePage')` — every page/slot component is lazy so the 26 feature folders code-split. */
export type LazyComponent<P = object> = () => Promise<{ default: ComponentLike<P> }>;

/** `React.ReactNode` in the competition repo (web only: web/src/core/types.ts). Children/cells/icons of the UI kit. */
export type ReactNodeLike = unknown;

/** The Express `Application` in the competition repo (only used by FeatureRoutes.mountExpress). */
export type ExpressAppLike = unknown;

/** JSON Schema object (OpenAI tools / structured output). Build it from zod with `z.toJSONSchema()`. */
export type JsonSchema = Record<string, unknown>;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/features.ts ═══
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** The 9 WORKER lanes. Only worker lanes own features and folders. */
export const LANES = ['C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'A1', 'A2', 'A3'] as const;
export type Lane = (typeof LANES)[number];

/** The 3 people. Each runs 1 orchestrator chat + 3 worker chats (DECISIONS D2). */
export const PEOPLE = ['A', 'B', 'C'] as const;
export type Person = (typeof PEOPLE)[number];

/**
 * Orchestrator lanes (DECISIONS D2/D5/D9): one per person, worktree `../nless-<a0|b0|c0>` tracking origin/main.
 * They own NO feature folder. They dispatch (`TASK TO:<lane>`), review merges against the spec, run integration and
 * production smoke checks, post `STAGE <person> ...` every 30 minutes, and may fix another lane's code only on a
 * `fix/<owner-lane>/<slug>` branch under the D5 rules. C0 also verifies the 13:00 core-loop gate on production.
 */
export const ORCHESTRATOR_LANES = ['A0', 'B0', 'C0'] as const;
export type OrchestratorLane = (typeof ORCHESTRATOR_LANES)[number];
/** Every value a `.lane` file may hold (board script, hooks, CI ownership check). */
export const ALL_LANES = [...ORCHESTRATOR_LANES, ...LANES] as const;
export type AnyLane = Lane | OrchestratorLane;
export const ORCHESTRATOR_OF: Record<Person, OrchestratorLane> = { A: 'A0', B: 'B0', C: 'C0' };

/** Priority tier (PLAN.md "Tier: core ก่อน ส่วนเสริมทีหลัง"). P0 = core loop, REAL by the 13:00 gate. A lane starts a
 *  P1–P3 feature only after the lead posts `LEAD: OPEN <tier>`. Exceptions: C3 starts F02 (P1) right after F03 without
 *  waiting (F03 uses DEV LOGIN until F02 lands); C1 starts F36 (P1) at 15:15 by the clock.
 *  P1 opens at checkpoint 11:30 (checkpoint 1 passed, ≤20% budget per person) else when the 13:00 gate passes ·
 *  P2 when the gate passed and ≤40% budget (else re-check 14:30) · P3 (F30 only) at 14:30 when P0 = R, P1 = R/S, ≤55%. */
export const TIERS = ['P0', 'P1', 'P2', 'P3'] as const;
export type Tier = (typeof TIERS)[number];

/** Port/DB offset per lane (prompts/C1-setup.md §2): API_PORT = 3000 + n, WEB_PORT = 5170 + n.
 *  Orchestrators use offset 0 (3000 / 5170): each one runs on a different PC, so the ports never clash (D15).
 *  Dev DB per lane: `nless_hack_<lane in lower case>` (+ `_test`) in the person's own Neon project. */
export const LANE_NUMBER: Record<AnyLane | 'main', number> = {
  main: 0, A0: 0, B0: 0, C0: 0, C1: 1, C2: 2, C3: 3, B1: 4, B2: 5, B3: 6, A1: 7, A2: 8, A3: 9,
};

export interface FeatureDef {
  readonly id: string;
  readonly slug: string;
  readonly lane: Lane;
  readonly title: string;
  /** Part of the MVP golden path (must reach R by the 13:00 core-loop gate). */
  readonly mvp: boolean;
  /** Priority tier; the lane order below already lists higher tiers first. */
  readonly tier: Tier;
  /** false = lives in server/src/core (F01 core, F35 core/jobs); true = has features/<slug>/ folders. */
  readonly folder: boolean;
  /**
   * Web path prefixes this feature owns, matched per path segment ('/live' owns '/live' and '/live/x', not '/livestream').
   * Longest prefix wins ('/channels/meta' → F18 over '/channels' → F17). Core fails loudly on a duplicate route.
   */
  readonly webPaths: readonly string[];
}

/**
 * Owner table: 31 features (PLAN.md, 20 Nov evening plan = 28 + F37 F38 F39 from DECISIONS D8/D17). Slugs from
 * feature-backlog.csv. No feature has two owners. Each feature's build spec: docs/specs/<ID>-<slug>.md
 * (slug `core/jobs` → file `F35-core-jobs.md`).
 * Retired IDs are gone for good (no folder, no contract, no FEATURE_STATUS row) and are NOT renumbered:
 * F19 F20 F25 F28 F29 F32 F33 F34 (PLAN.md "ตัดออกจาก scope").
 */
export const FEATURES = [
  { id: 'F01', slug: 'core', lane: 'C1', title: 'Project foundation', mvp: true, tier: 'P0', folder: false, webPaths: ['/', '/account', '/dev-login', '/oauth/callback', '/forbidden', '/no-business'] },
  { id: 'F02', slug: 'auth', lane: 'C3', title: 'Identity and sessions', mvp: false, tier: 'P1', folder: true, webPaths: ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'] },
  { id: 'F03', slug: 'tenancy', lane: 'C3', title: 'Accounts, businesses, members, permissions', mvp: true, tier: 'P0', folder: true, webPaths: ['/members', '/invitations', '/businesses', '/onboarding'] },
  { id: 'F04', slug: 'business-settings', lane: 'C3', title: 'Business settings', mvp: true, tier: 'P0', folder: true, webPaths: ['/business', '/bot-settings'] },
  { id: 'F05', slug: 'knowledge', lane: 'B1', title: 'Knowledge lifecycle', mvp: true, tier: 'P0', folder: true, webPaths: ['/knowledge'] },
  { id: 'F06', slug: 'knowledge-import', lane: 'B3', title: 'Import and extraction', mvp: false, tier: 'P1', folder: true, webPaths: ['/imports'] },
  { id: 'F07', slug: 'knowledge-search', lane: 'B1', title: 'Retrieval and evaluation', mvp: true, tier: 'P0', folder: true, webPaths: ['/knowledge-search'] },
  { id: 'F08', slug: 'catalog', lane: 'B1', title: 'Catalog: products, services, variants', mvp: true, tier: 'P0', folder: true, webPaths: ['/catalog'] },
  { id: 'F09', slug: 'inbox', lane: 'A1', title: 'Inbox, history and Demo Chat', mvp: true, tier: 'P0', folder: true, webPaths: ['/chat', '/demo-chat'] },
  { id: 'F10', slug: 'ai-agent', lane: 'B2', title: 'AI turn and tools', mvp: true, tier: 'P0', folder: true, webPaths: ['/ai-settings'] },
  { id: 'F11', slug: 'team', lane: 'A1', title: 'Team and human handoff', mvp: false, tier: 'P0', folder: true, webPaths: ['/team'] },
  { id: 'F12', slug: 'message-templates', lane: 'A1', title: 'Rich messages and templates', mvp: false, tier: 'P2', folder: true, webPaths: ['/templates'] },
  { id: 'F13', slug: 'orders', lane: 'A2', title: 'Commerce and orders', mvp: false, tier: 'P1', folder: true, webPaths: ['/orders'] },
  { id: 'F14', slug: 'payments', lane: 'A2', title: 'QR payment and slip check', mvp: false, tier: 'P1', folder: true, webPaths: ['/payments'] },
  { id: 'F15', slug: 'booking', lane: 'A3', title: 'Booking and reminders', mvp: false, tier: 'P2', folder: true, webPaths: ['/appointments'] },
  { id: 'F16', slug: 'calendar', lane: 'A3', title: 'Google Calendar', mvp: false, tier: 'P2', folder: true, webPaths: ['/calendar'] },
  { id: 'F17', slug: 'line', lane: 'C2', title: 'LINE', mvp: true, tier: 'P0', folder: true, webPaths: ['/channels'] },
  { id: 'F18', slug: 'meta', lane: 'C2', title: 'Facebook Messenger and Instagram', mvp: false, tier: 'P1', folder: true, webPaths: ['/channels/meta'] },
  { id: 'F21', slug: 'comments', lane: 'C2', title: 'Comment-to-DM', mvp: false, tier: 'P2', folder: true, webPaths: ['/comment-replies'] },
  { id: 'F22', slug: 'live-commerce', lane: 'A2', title: 'Live commerce and product codes', mvp: false, tier: 'P2', folder: true, webPaths: ['/product-codes', '/live'] },
  { id: 'F23', slug: 'broadcast', lane: 'A1', title: 'Broadcast and audiences', mvp: false, tier: 'P2', folder: true, webPaths: ['/broadcast'] },
  { id: 'F24', slug: 'crm', lane: 'A3', title: 'CRM and tag automation', mvp: false, tier: 'P1', folder: true, webPaths: ['/customers'] },
  { id: 'F26', slug: 'insights', lane: 'B3', title: 'Insights and summaries', mvp: false, tier: 'P2', folder: true, webPaths: ['/insights'] },
  { id: 'F27', slug: 'analytics', lane: 'B3', title: 'Dashboard, usage/cost, traces', mvp: false, tier: 'P2', folder: true, webPaths: ['/dashboard', '/usage', '/traces'] },
  { id: 'F30', slug: 'voice', lane: 'B2', title: 'Browser voice (OpenAI Realtime)', mvp: false, tier: 'P3', folder: true, webPaths: ['/voice', '/call'] },
  { id: 'F31', slug: 'notifications', lane: 'C3', title: 'Notifications and push', mvp: false, tier: 'P1', folder: true, webPaths: ['/notifications'] },
  { id: 'F35', slug: 'core/jobs', lane: 'C1', title: 'Reliability: jobs, outbox, ops tools', mvp: true, tier: 'P0', folder: false, webPaths: ['/ops'] },
  { id: 'F36', slug: 'release', lane: 'C1', title: 'Integration, release, evidence', mvp: false, tier: 'P1', folder: true, webPaths: ['/release'] },
  { id: 'F37', slug: 'evals', lane: 'B1', title: 'AI evals and the AI quality page', mvp: false, tier: 'P2', folder: true, webPaths: ['/ai-quality'] },
  { id: 'F38', slug: 'follow-ups', lane: 'B2', title: 'Follow-up nudges', mvp: false, tier: 'P2', folder: true, webPaths: ['/follow-ups'] },
  { id: 'F39', slug: 'chatgpt-catalog', lane: 'C1', title: 'ChatGPT-ready catalog (ACP product feed + MCP server)', mvp: false, tier: 'P2', folder: true, webPaths: ['/chatgpt-catalog'] },
] as const satisfies readonly FeatureDef[];

export type FeatureId = (typeof FEATURES)[number]['id'];
export type FeatureSlug = (typeof FEATURES)[number]['slug'];
/** The 29 slugs that own server/src/features/<slug>, web/src/features/<slug>, shared/features/<slug>. */
export type FolderSlug = Exclude<FeatureSlug, 'core' | 'core/jobs'>;
/** What a migration / seed may depend on: core (F01+F35 base schema) or a feature folder. */
export type MigrationOwner = 'core' | FolderSlug;

/**
 * Work order per lane (PLAN.md, 20 Nov evening plan), in the order the lane works. Moves vs 18 Nov: F03 + F02 C1 → C3
 * (C1 keeps only setup + jobs before the gate), F21 A2 → C2 (same lane as F18 it depends on), F06 B1 → B3, F26 B2 → B3.
 * Added 20 Nov evening (DECISIONS D8/D17): F37 → B1 (free after its three P0 features), F38 → B2 (between F10 and the
 * P3 voice feature), F39 → C1 (between F35 and the 15:15 release work).
 * Tiers: C1 F01 P0 → F35 P0 → F39 P2 → F36 P1 (15:15 by the clock; F39 pauses then) · C2 F17 P0 → F18 P1 → F21 P2 ·
 * C3 F04 P0 → F03 P0 → F02 P1 → F31 P2 · B1 F05 → F07 → F08 (all P0) → F37 P2 · B2 F10 P0 → F38 P2 → F30 P3 ·
 * B3 F06 P1 → F26 P2 → F27 P2 · A1 F09 P0 → F11 P0 → F12 P2 → F23 P2 · A2 F13 → F14 → F22 (all P1) ·
 * A3 F24 P1 → F15 P2 → F16 P2.
 * A2, A3 and B3 have no P0 work: they read their specs and plan until `LEAD: OPEN P1`.
 */
export const LANE_ORDER: Record<Lane, readonly FeatureId[]> = {
  C1: ['F01', 'F35', 'F39', 'F36'],
  C2: ['F17', 'F18', 'F21'],
  C3: ['F04', 'F03', 'F02', 'F31'],
  B1: ['F05', 'F07', 'F08', 'F37'],
  B2: ['F10', 'F38', 'F30'],
  B3: ['F06', 'F26', 'F27'],
  A1: ['F09', 'F11', 'F12', 'F23'],
  A2: ['F13', 'F14', 'F22'],
  A3: ['F24', 'F15', 'F16'],
};

/** Golden path that must be REAL at the 13:00 core-loop gate (+ the web Demo Chat inside F09, + the F11 takeover part). */
export const MVP_GOLDEN_PATH: readonly FeatureId[] = ['F01', 'F35', 'F03', 'F04', 'F05', 'F07', 'F08', 'F09', 'F10', 'F17'];
/** Stretch: order proposal (F13 createOrderFromProposal stage 'propose') and F18 Messenger/Instagram to Meta test users. */
export const MVP_STRETCH: readonly FeatureId[] = ['F13', 'F18'];

/** Git branch per PR: `lane/<LANE>/<folder slug with / replaced by ->[-2..]`, e.g. lane/C1/core-jobs, lane/A1/inbox-2. */
export const LANE_BRANCH_PATTERN = /^lane\/(A[1-3]|B[1-3]|C[1-3])\/[a-z0-9][a-z0-9-]*$/;
/** Team-lead emergency branches: ownership check prints a warning and passes. Needs human review. */
export const LEAD_BRANCH_PATTERN = /^lead\/[a-z0-9][a-z0-9-]*$/;
/**
 * Orchestrator cross-lane fix (DECISIONS D5): `fix/<OWNER lane>/<slug>`, opened only from an orchestrator worktree
 * (`.lane` = A0 / B0 / C0). The ownership check then applies the OWNER lane's path rules, requires at least one test
 * file in the diff, and fails when the diff changes more than 40 lines outside tests, touches a migration, or edits
 * `docs/competition-plan/templates/contracts.ts`. Bigger fixes go to the owner as `FIX TO:<lane>`; contract changes
 * still use `CHANGE`.
 */
export const FIX_BRANCH_PATTERN = /^fix\/(A[1-3]|B[1-3]|C[1-3])\/[a-z0-9][a-z0-9-]*$/;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/types.ts ═══
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** 02 §5. Every HTTP success body. Built by core from the handler's return value. */
export interface ApiMeta {
  requestId: string;
  schemaVersion: 1;
  serverTime: string;
}
export interface ApiResult<T> {
  data: T;
  meta: ApiMeta;
}
/** 02 §5. Every HTTP error body. Built by core from a thrown AppError (anything else → INTERNAL). */
export interface ApiFailure {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'BUSINESS_INACTIVE'
  | 'ACCOUNT_DISABLED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SLOT_FULL'
  | 'SOLD_OUT'
  | 'CHANNEL_NOT_CONNECTED'
  | 'PROPOSAL_EXPIRED'
  | 'POLICY_BLOCKED'
  | 'KNOWLEDGE_NOT_READY'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'PROVIDER_UNAVAILABLE'
  /** OpenAI 429 `insufficient_quota` family (credits gone / project hard limit hit). Always retryable: false. */
  | 'PROVIDER_BUDGET_EXHAUSTED'
  | 'SERVICE_NOT_READY';

/** There are no plans or quotas in the app (everything is unlimited), so there is no QUOTA_EXCEEDED code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  BUSINESS_INACTIVE: 403,
  ACCOUNT_DISABLED: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SLOT_FULL: 409,
  SOLD_OUT: 409,
  CHANNEL_NOT_CONNECTED: 409,
  PROPOSAL_EXPIRED: 422,
  POLICY_BLOCKED: 422,
  KNOWLEDGE_NOT_READY: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_BUDGET_EXHAUSTED: 503,
  SERVICE_NOT_READY: 503,
};

/** Cursor page. `nextCursor` is opaque; null = no more rows. Never offset paging on live data. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A reporting range in UTC ISO-8601, half-open [from, to). Used by every `get…Metrics` contract (F27 seller impact
 * metrics read other features' numbers only through those contracts, never through their tables).
 */
export interface MetricsRange {
  from: string;
  to: string;
}

/** One row of GET /api/v1/features (core). The web shell hides menu entries and routes where `visible` is false. */
export interface FeatureFlagView {
  featureId: string;
  slug: string;
  lane: string;
  tier: 'P0' | 'P1' | 'P2' | 'P3';
  /** From the core `feature_flags` table (ops page toggle, initial value from HIDDEN_FEATURES). */
  hidden: boolean;
  reason: string | null;
  /** The feature still has only the scaffold's placeholder route (not built yet). */
  placeholder: boolean;
  /** !hidden && !(placeholder && production): no placeholder page is ever shown on production (D6). */
  visible: boolean;
}
/** Body of PUT /api/v1/ops/features/:featureId (platform admin; the toggle UI lives on the F35 ops page). */
export interface SetFeatureFlagBody {
  hidden: boolean;
  reason?: string;
}

/**
 * 02 §5, extended (role, isPlatformAdmin). Built ONLY by core after it checks session + membership.
 * Never taken from a request body. isPlatformAdmin only unlocks F35 ops tools (/ops); there is no admin feature.
 */
export interface AuthScope {
  userId: string;
  accountId: string;
  businessId?: string;
  permissions: PermissionKey[];
  role?: MembershipRole;
  isPlatformAdmin: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled';
  isPlatformAdmin: boolean;
  locale: 'th' | 'en';
  /** How the current session was created. 'dev' = DEV LOGIN (setup); F02 adds 'password'. */
  sessionKind: 'dev' | 'password' | 'oauth';
}

export interface BusinessRecord {
  id: string;
  accountId: string;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  timezone: string;
  language: 'th' | 'en';
  version: number;
}

/** 'web' = Demo Chat (core sender). 'line' = F17, 'facebook' (Messenger) + 'instagram' = F18 (C2). No other channel. */
export type Channel = 'web' | 'line' | 'facebook' | 'instagram';
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';
export type KnowledgeStatus = 'draft' | 'reviewed' | 'active' | 'inactive' | 'deleted';
export type KnowledgeIndexState = 'not_started' | 'indexing' | 'ready' | 'failed';
/** Broadcast opt-in/opt-out kept by F24 crm and re-checked by F23 broadcast at send time (not a legal consent record). */
export type MarketingConsent = 'granted' | 'revoked' | 'unknown';
export type ShippingRule =
  | { kind: 'threshold'; feeMinor: number; freeFromSubtotalMinor: number }
  | { kind: 'flat'; feeMinor: number };
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** Local times in the business timezone, 'HH:mm'. Empty array = closed. Used by F04 settings and F15 booking. */
export type WeeklyHours = Record<Weekday, { open: string; close: string }[]>;
export type DeliveryMode = 'real' | 'sandbox';
export type DeliveryState = 'not_required' | 'pending' | 'sent' | 'failed' | 'unknown';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageAuthor = 'customer' | 'ai' | 'staff' | 'system';
export type MessageOrigin = 'live' | 'demo' | 'broadcast' | 'comment' | 'system';

// ---- MessagePart (02 §8): the only content blocks UI renders. No HTML. No URL a user supplied. ----

export interface TextPart {
  type: 'text';
  text: string;
}
/** Image by canonical upload reference (core `files` row). `url` is filled by the server for display. */
export interface ImagePart {
  type: 'image';
  fileId: string;
  alt?: string;
  url?: string;
}
export interface FilePart {
  type: 'file';
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}
export interface ProductCardItem {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  unitPriceMinor: number;
  currency: 'THB';
  available: number | null;
  soldOut: boolean;
  imageFileId?: string;
  /** Catalog version the price came from (evidence). */
  version: number;
}
export interface ProductCardPart {
  type: 'product_card';
  items: ProductCardItem[];
  /** Plain-text fallback for channels that cannot render cards (LINE altText, SMS-like). */
  altText: string;
}
export interface ReviewLine {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}
export interface OrderReviewPart {
  type: 'order_review';
  proposalId: string;
  version: number;
  lines: ReviewLine[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: 'THB';
  expiresAt: string;
  /** Opaque server token; the customer's confirm action must send it back. Not a secret key. */
  reviewToken: string;
}
export interface BookingReviewPart {
  type: 'booking_review';
  proposalId: string;
  version: number;
  serviceName: string;
  resourceName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  /** e.g. "22 พ.ย. 2569 10:00 Asia/Bangkok" — rendered by the server, not by the model. */
  localDisplay: string;
  expiresAt: string;
  reviewToken: string;
}
export type ButtonAction =
  | { kind: 'postback'; data: string }
  | { kind: 'link'; url: string }
  | { kind: 'confirm_proposal'; proposalId: string; version: number; reviewToken: string; decision: 'confirm' | 'cancel' };
export interface ActionButtonsPart {
  type: 'action_buttons';
  text?: string;
  /** Max 4 (LINE limit). `link` URLs must be server-generated (e.g. the F14 payment page), never model text. */
  buttons: { id: string; label: string; action: ButtonAction }[];
}
export type MessagePart =
  | TextPart
  | ImagePart
  | FilePart
  | ProductCardPart
  | OrderReviewPart
  | BookingReviewPart
  | ActionButtonsPart;

// ---- Chat turn (02 §8) ----

export interface ChatTurnRequest {
  clientRequestId: string;
  text: string;
  attachmentIds?: string[];
}
export type ProposalKind = 'order.create' | 'appointment.create' | 'appointment.reschedule' | 'appointment.cancel';
export interface ProposalSummary {
  id: string;
  kind: ProposalKind;
  version: number;
  expiresAt: string;
  summary: string;
  reviewToken: string;
}
export interface ChatTurnResult {
  turnId: string;
  state: 'completed' | 'awaiting_confirmation' | 'handoff' | 'pending' | 'failed';
  reply: { parts: MessagePart[]; evidenceIds: string[] };
  proposal?: ProposalSummary;
  /** generateReply() does not send, so it returns { mode, state: 'not_required' }. */
  delivery: { mode: DeliveryMode; state: DeliveryState };
}
/** The customer's consent action (button / postback). Model text saying "confirmed" is NOT consent. */
export interface ConfirmRequest {
  clientRequestId: string;
  proposalId: string;
  version: number;
  reviewToken: string;
  decision: 'confirm' | 'cancel';
}

// ---- Realtime (one WebSocket at /ws, cookie session, client subscribes per businessId) ----

export type RealtimeEvent =
  | { type: 'message.created'; conversationId: string; message: MessageRecordLite }
  | { type: 'message.updated'; conversationId: string; messageId: string; delivery: { mode: DeliveryMode | null; state: DeliveryState } }
  | { type: 'conversation.updated'; conversationId: string; handler: 'ai' | 'human'; assigneeUserId: string | null; status: 'open' | 'closed'; version: number }
  | { type: 'notification.created'; userId: string; notificationId: string; title: string }
  | { type: 'knowledge.status'; knowledgeItemId: string; indexState: KnowledgeIndexState }
  | { type: 'job.updated'; jobId: string; jobType: string; state: JobState; progress?: { done: number; total: number } }
  | { type: 'custom'; featureId: FeatureId; name: string; data: Record<string, unknown> };

/** Small message shape for realtime payloads (full MessageRecord lives in shared/features/inbox). */
export interface MessageRecordLite {
  id: string;
  seq: number;
  direction: MessageDirection;
  author: MessageAuthor;
  parts: MessagePart[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/language.ts ═══  (added 21 Nov: the product works in Thai AND English)
// Pure functions, no imports; owner F01 core · C1. Unlike the type-only sections, C1 IMPLEMENTS these two at setup.
// The product works in Thai AND English. Every text that CODE writes to a customer (not the model) exists in both
// languages and is picked with CustomerLanguage. A hard-coded single-language customer text is a defect.

export type CustomerLanguage = 'th' | 'en';
/**
 * @owner F01 core · C1 · consumers: B2 F10/F38, A1 F09 (getCustomerLanguage), every lane's tests
 * Language of ONE piece of customer text, by counting letters after removing URLs, e-mail addresses, SKU-like tokens
 * (letters+digits joined by '-', e.g. A-GAME-01) and digits: thai = \p{Script=Thai} letters, latin = [A-Za-z].
 * thai > 0 && thai >= latin → 'th' · latin >= 3 && latin > thai → 'en' · otherwise null (no letters: '2', '👍', 'ok').
 * Examples: 'A-GAME-01 ราคาเท่าไหร่' → 'th' · 'How much is A-GAME-01?' → 'en' · 'สนใจ board game ตัวนี้ค่ะ' → 'th' ·
 * 'Hi, do you have การ์ด?' → 'en' · 'ok' → null.
 * @fake real (pure function, shipped at setup).
 */
export declare function detectTextLanguage(text: string): CustomerLanguage | null;
/**
 * @owner F01 core · C1. Customer-facing money text from integer satang: formatMoneyText(149000, 'th') → '1,490 บาท',
 * (149000, 'en') → '1,490 baht', (9950, 'en') → '99.50 baht' (decimals only when minor % 100 !== 0). Server-side
 * messages, receipts, card altText and AI tool results use this; web pages keep WebCore.formatMoney.
 * @fake real (pure function, shipped at setup).
 */
export declare function formatMoneyText(minor: number, lang: CustomerLanguage): string;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/permissions.ts ═══
// Ported from Papi permission catalog (26 keys minus `account.billing`, which left with billing = 25; secondary
// on/off/never buckets). Keys keep Papi names so ported pages keep working: `product.*` covers knowledge AND catalog.
// Rule: ABSENT MEANS DENIED. Owner holds every key. Staff holds exactly memberships.permissions.
// `never` keys are account-scoped or escalating: staff can never hold them.
// Platform admin gets NO merchant key implicitly (privacy); only F35 ops tools use requirePlatformAdmin().
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type MembershipRole = 'owner' | 'staff';

export const PERMISSIONS = {
  'chat.read': { group: 'chat', staff: 'on' },
  'chat.reply': { group: 'chat', staff: 'on' },
  'chat.takeover': { group: 'chat', staff: 'on' },
  'chat.schedule': { group: 'chat', staff: 'off' },
  'chat.view_all': { group: 'chat', staff: 'off' },
  'orders.read': { group: 'orders', staff: 'on' },
  'orders.write': { group: 'orders', staff: 'off' },
  'appointments.read': { group: 'appointments', staff: 'on' },
  'appointments.write': { group: 'appointments', staff: 'on' },
  'appointments.settings': { group: 'appointments', staff: 'off' },
  'product.read': { group: 'product', staff: 'on' },
  'product.write': { group: 'product', staff: 'off' },
  'product.delete': { group: 'product', staff: 'off' },
  'broadcast.read': { group: 'broadcast', staff: 'off' },
  'broadcast.send': { group: 'broadcast', staff: 'off' },
  'broadcast.tags': { group: 'broadcast', staff: 'off' },
  'insights.read': { group: 'insights', staff: 'off' },
  'insights.demo': { group: 'insights', staff: 'off' },
  'business.read': { group: 'business', staff: 'on' },
  'business.update': { group: 'business', staff: 'off' },
  'business.bot_settings': { group: 'business', staff: 'off' },
  'business.channels': { group: 'business', staff: 'off' },
  'business.commerce': { group: 'business', staff: 'off' },
  'account.members': { group: 'account', staff: 'never' },
  'account.businesses': { group: 'account', staff: 'never' },
} as const satisfies Record<string, { group: string; staff: 'on' | 'off' | 'never' }>;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Default grant for a new staff member (the `on` bucket). SPEC §5 Staff A starts with exactly this. */
export const STAFF_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  'chat.read', 'chat.reply', 'chat.takeover', 'orders.read',
  'appointments.read', 'appointments.write', 'product.read', 'business.read',
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/fixtures.ts ═══
// SPEC §5 synthetic data. One source for: core seed (users..messages), feature seed.ts files
// (catalog, knowledge, templates, tags, booking), and every @fake below.
// IDs are deterministic UUIDs so fakes, seeds and tests agree. Auth never trusts an alias or id
// from a request — only the session. Domain example.test has no real recipients. No real phone,
// bank account, customer or merchant data.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Deterministic clock for unit/integration tests (10:00 Bangkok). Interactive app uses the real clock. */
export const CLOCK_FIXTURE = '2026-11-21T03:00:00Z';

export interface SeedData {
  users: { alias: string; id: string; email: string; displayName: string; isPlatformAdmin: boolean }[];
  accounts: { alias: string; id: string; name: string; ownerAlias: string }[];
  businesses: {
    alias: string; id: string; accountAlias: string; name: string; timezone: 'Asia/Bangkok'; language: 'th';
    marker: string; shipping: ShippingRule; settings: BusinessSettingsFixture;
  }[];
  memberships: { businessAlias: string; userAlias: string; role: MembershipRole; permissions: readonly PermissionKey[] }[];
  customers: { alias: string; id: string; businessAlias: string; channel: Channel; externalId: string; displayName: string; consent: MarketingConsent }[];
  conversations: {
    alias: string; id: string; businessAlias: string; customerAlias: string; channel: Channel;
    handler: 'ai' | 'human'; assigneeAlias: string | null;
    messages: { author: MessageAuthor; authorAlias?: string; text: string }[];
  }[];
  catalog: {
    alias: string; id: string; businessAlias: string; sku: string; kind: 'product' | 'service';
    name: string; nameEn: string; priceMinor: number; currency: 'THB'; stock: number | null; shippable: boolean;
    durationMinutes: number | null; resourceAlias: string | null;
    variants: { alias: string; id: string; name: string }[];
    version: number;
  }[];
  knowledgeFolders: { alias: string; id: string; businessAlias: string; name: string }[];
  knowledge: {
    alias: string; id: string; businessAlias: string; folderAlias: string | null; title: string; body: string;
    status: KnowledgeStatus; indexState: KnowledgeIndexState; revision: number;
  }[];
  templates: { alias: string; id: string; businessAlias: string; name: string; text: string }[];
  tags: { alias: string; id: string; businessAlias: string; name: string; customerAliases: string[] }[];
  resources: { alias: string; id: string; businessAlias: string; name: string; capacity: number }[];
  slots: { alias: string; businessAlias: string; serviceAlias: string; resourceAlias: string; startAt: string; endAt: string; capacity: number }[];
}

export interface BusinessSettingsFixture {
  aiEnabled: boolean;
  language: 'th' | 'en';
  hours: WeeklyHours;
}

const HOURS_A_DAILY_10_20: WeeklyHours = {
  mon: [{ open: '10:00', close: '20:00' }], tue: [{ open: '10:00', close: '20:00' }],
  wed: [{ open: '10:00', close: '20:00' }], thu: [{ open: '10:00', close: '20:00' }],
  fri: [{ open: '10:00', close: '20:00' }], sat: [{ open: '10:00', close: '20:00' }],
  sun: [{ open: '10:00', close: '20:00' }],
};
const HOURS_B_MON_SAT_09_18: WeeklyHours = {
  mon: [{ open: '09:00', close: '18:00' }], tue: [{ open: '09:00', close: '18:00' }],
  wed: [{ open: '09:00', close: '18:00' }], thu: [{ open: '09:00', close: '18:00' }],
  fri: [{ open: '09:00', close: '18:00' }], sat: [{ open: '09:00', close: '18:00' }],
  sun: [],
};

export const SEED: SeedData = {
  users: [
    { alias: 'owner_a', id: '00000000-0000-4000-8000-0000000a0001', email: 'owner.a@example.test', displayName: 'Owner A', isPlatformAdmin: false },
    { alias: 'staff_a', id: '00000000-0000-4000-8000-0000000a0002', email: 'staff.a@example.test', displayName: 'Staff A', isPlatformAdmin: false },
    { alias: 'owner_b', id: '00000000-0000-4000-8000-0000000b0001', email: 'owner.b@example.test', displayName: 'Owner B', isPlatformAdmin: false },
    { alias: 'staff_b', id: '00000000-0000-4000-8000-0000000b0002', email: 'staff.b@example.test', displayName: 'Staff B', isPlatformAdmin: false },
    { alias: 'platform_admin', id: '00000000-0000-4000-8000-00000000ad01', email: 'admin@example.test', displayName: 'Platform Admin', isPlatformAdmin: true },
  ],
  accounts: [
    { alias: 'account_demo_a', id: '00000000-0000-4000-8000-0000000a1000', name: 'Demo Account A', ownerAlias: 'owner_a' },
    { alias: 'account_demo_b', id: '00000000-0000-4000-8000-0000000b1000', name: 'Demo Account B', ownerAlias: 'owner_b' },
  ],
  businesses: [
    {
      alias: 'biz_demo_a', id: '00000000-0000-4000-8000-0000000a2000', accountAlias: 'account_demo_a',
      name: 'Demo Boardgame Shop', timezone: 'Asia/Bangkok', language: 'th', marker: 'TENANT_A_ONLY_FOX_731',
      shipping: { kind: 'threshold', feeMinor: 10000, freeFromSubtotalMinor: 200000 },
      settings: { aiEnabled: true, language: 'th', hours: HOURS_A_DAILY_10_20 },
    },
    {
      alias: 'biz_demo_b', id: '00000000-0000-4000-8000-0000000b2000', accountAlias: 'account_demo_b',
      name: 'Demo Repair Studio', timezone: 'Asia/Bangkok', language: 'th', marker: 'TENANT_B_ONLY_OWL_482',
      shipping: { kind: 'flat', feeMinor: 5000 },
      settings: { aiEnabled: true, language: 'th', hours: HOURS_B_MON_SAT_09_18 },
    },
  ],
  memberships: [
    { businessAlias: 'biz_demo_a', userAlias: 'owner_a', role: 'owner', permissions: [] },
    { businessAlias: 'biz_demo_a', userAlias: 'staff_a', role: 'staff', permissions: STAFF_DEFAULT_PERMISSIONS },
    { businessAlias: 'biz_demo_b', userAlias: 'owner_b', role: 'owner', permissions: [] },
    { businessAlias: 'biz_demo_b', userAlias: 'staff_b', role: 'staff', permissions: STAFF_DEFAULT_PERMISSIONS },
  ],
  customers: [
    { alias: 'cust_a1', id: '00000000-0000-4000-8000-0000000a3001', businessAlias: 'biz_demo_a', channel: 'line', externalId: 'Udemo-a-customer-one', displayName: 'A Customer One', consent: 'granted' },
    { alias: 'cust_a2', id: '00000000-0000-4000-8000-0000000a3002', businessAlias: 'biz_demo_a', channel: 'facebook', externalId: 'psid-demo-a-customer-two', displayName: 'A Customer Two', consent: 'revoked' },
    { alias: 'cust_b1', id: '00000000-0000-4000-8000-0000000b3001', businessAlias: 'biz_demo_b', channel: 'line', externalId: 'Udemo-b-customer-one', displayName: 'B Customer One', consent: 'granted' },
    { alias: 'cust_b2', id: '00000000-0000-4000-8000-0000000b3002', businessAlias: 'biz_demo_b', channel: 'instagram', externalId: 'igsid-demo-b-customer-two', displayName: 'B Customer Two', consent: 'unknown' },
  ],
  conversations: [
    {
      alias: 'conv_a_ai', id: '00000000-0000-4000-8000-0000000a4001', businessAlias: 'biz_demo_a', customerAlias: 'cust_a1',
      channel: 'line', handler: 'ai', assigneeAlias: null,
      messages: [{ author: 'customer', text: 'Hi, do you ship on weekends? A-CARD-01 มีไหมครับ' }],
    },
    {
      alias: 'conv_a_staff', id: '00000000-0000-4000-8000-0000000a4002', businessAlias: 'biz_demo_a', customerAlias: 'cust_a2',
      channel: 'facebook', handler: 'human', assigneeAlias: 'staff_a',
      messages: [
        { author: 'customer', text: 'ขอคุยกับพนักงานค่ะ' },
        { author: 'staff', authorAlias: 'staff_a', text: 'สวัสดีค่ะ ยินดีให้บริการค่ะ' },
      ],
    },
    {
      alias: 'conv_b_ai', id: '00000000-0000-4000-8000-0000000b4001', businessAlias: 'biz_demo_b', customerAlias: 'cust_b1',
      channel: 'line', handler: 'ai', assigneeAlias: null,
      messages: [{ author: 'customer', text: 'B-KIT-01 ราคาเท่าไหร่ครับ' }],
    },
    {
      alias: 'conv_b_staff', id: '00000000-0000-4000-8000-0000000b4002', businessAlias: 'biz_demo_b', customerAlias: 'cust_b2',
      channel: 'instagram', handler: 'human', assigneeAlias: 'staff_b',
      messages: [
        { author: 'customer', text: 'Can I book device setup on Saturday?' },
        { author: 'staff', authorAlias: 'staff_b', text: 'ได้ครับ เดี๋ยวส่งเวลาที่ว่างให้นะครับ' },
      ],
    },
  ],
  catalog: [
    { alias: 'item_a_game', id: '00000000-0000-4000-8000-0000000a5001', businessAlias: 'biz_demo_a', sku: 'A-GAME-01', kind: 'product', name: 'เกมตัวอย่าง Demo Quest', nameEn: 'Demo Quest board game', priceMinor: 149000, currency: 'THB', stock: 5, shippable: true, durationMinutes: null, resourceAlias: null, variants: [{ alias: 'var_a_game_std', id: '00000000-0000-4000-8000-0000000a5101', name: 'Standard' }], version: 1 },
    { alias: 'item_a_card', id: '00000000-0000-4000-8000-0000000a5002', businessAlias: 'biz_demo_a', sku: 'A-CARD-01', kind: 'product', name: 'ชุดการ์ดตัวอย่าง Demo Cards', nameEn: 'Demo Cards card set', priceMinor: 9900, currency: 'THB', stock: 8, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_a_sold', id: '00000000-0000-4000-8000-0000000a5003', businessAlias: 'biz_demo_a', sku: 'A-SOLD-01', kind: 'product', name: 'เกมหมดสต็อก Demo Sold Out', nameEn: 'Demo Sold Out game', priceMinor: 50000, currency: 'THB', stock: 0, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_a_service', id: '00000000-0000-4000-8000-0000000a5004', businessAlias: 'biz_demo_a', sku: 'A-SERVICE-01', kind: 'service', name: 'สอนเล่นเกม 30 นาที', nameEn: 'Game teaching 30 min', priceMinor: 50000, currency: 'THB', stock: null, shippable: false, durationMinutes: 30, resourceAlias: 'res_a1', variants: [], version: 1 },
    { alias: 'item_b_kit', id: '00000000-0000-4000-8000-0000000b5001', businessAlias: 'biz_demo_b', sku: 'B-KIT-01', kind: 'product', name: 'Repair kit ตัวอย่าง', nameEn: 'Demo repair kit', priceMinor: 39000, currency: 'THB', stock: 2, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_b_service', id: '00000000-0000-4000-8000-0000000b5002', businessAlias: 'biz_demo_b', sku: 'B-SERVICE-01', kind: 'service', name: 'บริการตั้งค่าอุปกรณ์ 30 นาที', nameEn: 'Device setup 30 min', priceMinor: 60000, currency: 'THB', stock: null, shippable: false, durationMinutes: 30, resourceAlias: 'res_b1', variants: [], version: 1 },
  ],
  knowledgeFolders: [
    { alias: 'folder_a_general', id: '00000000-0000-4000-8000-0000000a6101', businessAlias: 'biz_demo_a', name: 'คำถามทั่วไป' },
    { alias: 'folder_a_policy', id: '00000000-0000-4000-8000-0000000a6102', businessAlias: 'biz_demo_a', name: 'นโยบาย' },
    { alias: 'folder_b_general', id: '00000000-0000-4000-8000-0000000b6101', businessAlias: 'biz_demo_b', name: 'คำถามทั่วไป' },
    { alias: 'folder_b_policy', id: '00000000-0000-4000-8000-0000000b6102', businessAlias: 'biz_demo_b', name: 'นโยบาย' },
  ],
  knowledge: [
    { alias: 'kn_a_faq', id: '00000000-0000-4000-8000-0000000a6001', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_general', title: 'เวลาเปิดร้านและบริการ', body: 'Demo Boardgame Shop เปิดทุกวัน 10:00–20:00 น. (Asia/Bangkok) มีบริการสอนเล่นเกม 30 นาที (A-SERVICE-01) Open daily 10:00-20:00. Marker TENANT_A_ONLY_FOX_731', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_return', id: '00000000-0000-4000-8000-0000000a6002', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_policy', title: 'นโยบายรับคืนสินค้า', body: 'รับคืนสินค้าที่ยังไม่แกะภายใน 7 วัน Unopened items can be returned within 7 days.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_shipping', id: '00000000-0000-4000-8000-0000000a6003', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_policy', title: 'ค่าจัดส่ง', body: 'ค่าส่ง 100 บาท เมื่อยอดสินค้าต่ำกว่า 2,000 บาท ยอดตั้งแต่ 2,000 บาทขึ้นไปส่งฟรี Shipping 100 THB under 2,000 THB, free from 2,000 THB.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_draft', id: '00000000-0000-4000-8000-0000000a6004', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_general', title: 'โปรโมชันร่าง', body: 'DRAFT ลด 50% ทุกเกม (ร่าง ห้ามใช้ตอบลูกค้า)', status: 'draft', indexState: 'not_started', revision: 1 },
    { alias: 'kn_a_deleted', id: '00000000-0000-4000-8000-0000000a6005', businessAlias: 'biz_demo_a', folderAlias: null, title: 'ราคาเก่า', body: 'DELETED ราคาเก่า A-GAME-01 990 บาท (ลบแล้ว ห้ามใช้ตอบลูกค้า)', status: 'deleted', indexState: 'ready', revision: 2 },
    { alias: 'kn_b_faq', id: '00000000-0000-4000-8000-0000000b6001', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_general', title: 'เวลาเปิดร้านและบริการ', body: 'Demo Repair Studio เปิดจันทร์–เสาร์ 09:00–18:00 น. (Asia/Bangkok) รับบริการตั้งค่าอุปกรณ์ 30 นาที (B-SERVICE-01) Open Mon-Sat 09:00-18:00. Marker TENANT_B_ONLY_OWL_482', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_return', id: '00000000-0000-4000-8000-0000000b6002', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_policy', title: 'นโยบายรับคืน kit', body: 'รับคืน kit ที่ยังไม่แกะภายใน 14 วัน Unopened kits can be returned within 14 days.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_shipping', id: '00000000-0000-4000-8000-0000000b6003', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_policy', title: 'ค่าจัดส่ง', body: 'ค่าส่งเหมา 50 บาท เฉพาะสินค้าที่จัดส่ง Flat 50 THB shipping for shipped items.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_draft', id: '00000000-0000-4000-8000-0000000b6004', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_general', title: 'บริการใหม่ร่าง', body: 'DRAFT บริการซ่อมด่วนภายใน 1 ชั่วโมง (ร่าง ห้ามใช้ตอบลูกค้า)', status: 'draft', indexState: 'not_started', revision: 1 },
    { alias: 'kn_b_inactive', id: '00000000-0000-4000-8000-0000000b6005', businessAlias: 'biz_demo_b', folderAlias: null, title: 'บริการที่ปิดแล้ว', body: 'INACTIVE บริการรับส่งถึงบ้าน (ปิดแล้ว ห้ามใช้ตอบลูกค้า)', status: 'inactive', indexState: 'ready', revision: 1 },
  ],
  templates: [
    { alias: 'tpl_welcome_a', id: '00000000-0000-4000-8000-0000000a7001', businessAlias: 'biz_demo_a', name: 'ทักทาย', text: 'สวัสดีค่ะ คุณ{{customerName}} ขอบคุณที่ทัก Demo Boardgame Shop ค่ะ' },
    { alias: 'tpl_welcome_b', id: '00000000-0000-4000-8000-0000000b7001', businessAlias: 'biz_demo_b', name: 'ทักทาย', text: 'สวัสดีครับ คุณ{{customerName}} Demo Repair Studio ยินดีให้บริการครับ' },
  ],
  tags: [
    { alias: 'tag_vip_a', id: '00000000-0000-4000-8000-0000000a8001', businessAlias: 'biz_demo_a', name: 'VIP', customerAliases: ['cust_a1', 'cust_a2'] },
    { alias: 'tag_vip_b', id: '00000000-0000-4000-8000-0000000b8001', businessAlias: 'biz_demo_b', name: 'VIP', customerAliases: ['cust_b1'] },
  ],
  resources: [
    { alias: 'res_a1', id: '00000000-0000-4000-8000-0000000a9001', businessAlias: 'biz_demo_a', name: 'A1', capacity: 1 },
    { alias: 'res_b1', id: '00000000-0000-4000-8000-0000000b9001', businessAlias: 'biz_demo_b', name: 'B1', capacity: 1 },
  ],
  slots: [
    { alias: 'slot_a_1122_1000', businessAlias: 'biz_demo_a', serviceAlias: 'item_a_service', resourceAlias: 'res_a1', startAt: '2026-11-22T03:00:00Z', endAt: '2026-11-22T03:30:00Z', capacity: 1 },
    // Shop B is closed on Sundays (HOURS_B_MON_SAT_09_18), so its test slot is Monday 23 Nov 10:00 Bangkok (v3 fix; was 22 Nov).
    { alias: 'slot_b_1123_1000', businessAlias: 'biz_demo_b', serviceAlias: 'item_b_service', resourceAlias: 'res_b1', startAt: '2026-11-23T03:00:00Z', endAt: '2026-11-23T03:30:00Z', capacity: 1 },
  ],
};

/**
 * SPEC §5 numbers every lane asserts. Shipping: A = 10000 below subtotal 200000, free from 200000;
 * B = flat 5000 for shippable items.
 */
export const SEED_CHECKS = [
  { business: 'biz_demo_a', sku: 'A-GAME-01', quantity: 2, subtotalMinor: 298000, deliveryFeeMinor: 0, totalMinor: 298000 },
  { business: 'biz_demo_a', sku: 'A-CARD-01', quantity: 2, subtotalMinor: 19800, deliveryFeeMinor: 10000, totalMinor: 29800 },
  { business: 'biz_demo_b', sku: 'B-KIT-01', quantity: 1, subtotalMinor: 39000, deliveryFeeMinor: 5000, totalMinor: 44000 },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: server/src/core/*  (public API = server/src/core/index.ts)   owner F01/F35 · C1 ═══
// These are REAL at SETUP READY (not fakes), except model.* which also has MODEL_MODE=fake.
// No entitlement/quota service exists: callers never check a plan or allowance before acting.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** The only error type services throw (R2). `status` comes from ERROR_HTTP_STATUS[code]. */
export declare class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, opts?: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown });
}

/** Result of getBusiness(): the business, the verified scope, and the user. */
export interface BusinessContext {
  business: BusinessRecord;
  scope: AuthScope & { businessId: string; role: MembershipRole };
  user: AuthUser;
}

/**
 * @owner F01 core · C1 · server/src/core/auth.ts
 * Reads the `nless_session` cookie, looks up sessions.token_hash (HMAC-SHA256 with SESSION_SECRET), checks expiry/revocation
 * and users.status. Throws AUTH_REQUIRED (401) or ACCOUNT_DISABLED (403).
 * DEV LOGIN sessions (kind 'dev') and F02 password sessions are read the same way, so F02 never
 * changes this signature.
 */
export declare function getUser(req: RequestLike): Promise<AuthUser>;

/**
 * @owner F01 core · C1 · server/src/core/auth.ts · consumers: core dev login, F02 auth (C3)
 * Issues a 32-byte base64url token, stores only HMAC-SHA256(SESSION_SECRET, token) in `sessions` with expiry
 * SESSION_TTL_HOURS, and sets the `nless_session` cookie (HttpOnly, SameSite=Lax, Secure per COOKIE_SECURE).
 * F02 calls this after a password check; it never writes the sessions table itself.
 */
export declare function createSession(userId: string, kind: 'dev' | 'password' | 'oauth', res: ResponseLike): Promise<void>;

/** @owner F01 core · C1. Revokes the current session row (if any) and clears the cookie. Idempotent. */
export declare function destroySession(req: RequestLike, res: ResponseLike): Promise<void>;
/**
 * @owner F01 core · C1 · consumers: C3 F02 (password reset / change, "log out everywhere"), C3 F03 (member removed)
 * Revokes every active session of the user (sets revoked_at) and returns how many were revoked. The next request with
 * one of those cookies gets AUTH_REQUIRED. Unknown user → 0.
 * @fake real implementation (one UPDATE on the core `sessions` table).
 */
export declare function revokeUserSessions(userId: string): Promise<number>;

/**
 * @owner F01 core · C1 · server/src/core/auth.ts
 * Resolves the business from `businessId` or `req.params.businessId`, re-reads membership on EVERY
 * request (revocation takes effect on the next request). Not a member, or another tenant's id →
 * NOT_FOUND (404, does not reveal existence). Business suspended/deleted or account not active →
 * BUSINESS_INACTIVE (403). Permissions: owner = every PermissionKey; staff = membership.permissions.
 */
export declare function getBusiness(req: RequestLike, businessId?: string): Promise<BusinessContext>;

/** @owner F01 core · C1. Sync. Throws PERMISSION_DENIED (403) when `key` is not in scope.permissions. */
export declare function requirePermission(scope: AuthScope, key: PermissionKey): void;

/**
 * @owner F01 core · C1. Sync. Throws PERMISSION_DENIED unless user.isPlatformAdmin.
 * ONLY for F35 ops tools (/ops: jobs, dead letters, protocol catalog, demo reset that F36 uses). There is no
 * platform-admin feature; no other lane calls this.
 */
export declare function requirePlatformAdmin(user: AuthUser): void;

// ---- db (server/src/core/db.ts) — pg Pool, statement_timeout 10s, pgvector types registered ----

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
export interface DbExecutor {
  /** Parameterized only ($1..$n). Never string-concatenate user input into SQL. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Exactly one row or throws AppError('NOT_FOUND'). */
  one<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T>;
  /** Zero or one row. */
  maybeOne<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T | null>;
}
export interface DbClient extends DbExecutor {
  /** BEGIN/COMMIT/ROLLBACK with a released client. Never call model.* or a provider inside. */
  tx<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  /** Session advisory lock on hashtext(key) (e.g. `conversation:<id>`), released in finally. Per-conversation ordering. */
  withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** `[0.1,0.2,...]` literal for a pgvector parameter. */
  toVector(values: readonly number[]): string;
}
/** @owner F01 core · C1 */
export declare const db: DbClient;

// ---- jobs (server/src/core/jobs.ts) — owner F35 core/jobs · C1 ----

export interface EnqueueOptions {
  /** Unique across all jobs. Same key again → no new job, returns the existing id with deduped: true. */
  dedupKey?: string;
  businessId?: string;
  /** ISO time; default now. */
  runAt?: string;
  /** Default 5 (JOBS_MAX_ATTEMPTS). */
  maxAttempts?: number;
  /** Jobs with the same lockKey never run concurrently (worker takes db.withAdvisoryLock(lockKey)). */
  lockKey?: string;
}
export interface JobContext<P> {
  id: string;
  type: string;
  payload: P;
  businessId: string | null;
  /** 1-based. */
  attempt: number;
  maxAttempts: number;
  /** Aborted when the lease expires or the server shuts down. */
  signal: AbortSignal;
  progress(done: number, total: number): Promise<void>;
}
/**
 * Throw → retry with backoff (5s × attempt²) until maxAttempts, then state 'dead' (visible in /ops).
 * Throw AppError with retryable:false → 'dead' immediately. Return { retryAt } → reschedule without
 * counting a failure. Handlers must be idempotent: a crash after commit re-runs the job.
 */
export type JobHandler<P = any> = (job: JobContext<P>) => Promise<void | { retryAt: string } | { result: Record<string, unknown> }>;

export interface JobsApi {
  /** Durable insert (survives restart). Pending is not done: never report a side effect before the handler finishes. */
  enqueue<P extends Record<string, unknown>>(type: string, payload: P, opts?: EnqueueOptions): Promise<{ jobId: string; deduped: boolean }>;
  get(jobId: string): Promise<{ id: string; type: string; state: JobState; attempts: number; lastError: string | null; progress: { done: number; total: number } | null } | null>;
}
/** @owner F35 core/jobs · C1. Worker loop: SELECT … FOR UPDATE SKIP LOCKED, lease 60s, poll JOBS_POLL_MS, wakes immediately on enqueue in-process. */
export declare const jobs: JobsApi;

/** Recurring job (F35 cron). Core enqueues `<name>` every `everySeconds` with dedupKey `<name>@<slot>`. */
export interface ScheduleDefinition {
  name: string;
  everySeconds: number;
  handler: JobHandler<{ slot: string }>;
}

// ---- model (server/src/core/model.ts) — the ONLY way to call AI. OpenAI API only. Source of truth: docs/openai-api.md ----
//
// * Core is the only code that imports the `openai` npm SDK (>= 7.58.0; setup installs 7.62.0):
//     new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_BASE_URL || undefined, maxRetries: 0, timeout: MODEL_TIMEOUT_MS })
//   SDK retries are off; core retries ONCE itself (429 rate limit / 5xx / timeout, honoring Retry-After, inside the same
//   deadline) and never retries the insufficient_quota family.
//   Features never import the SDK and never fetch api.openai.com (sole exception: the F30 browser page posts its SDP to
//   /v1/realtime/calls with the ephemeral client secret that core minted). There is no other AI provider in this app.
// * Responses API (`openai.responses.create`), never Chat Completions. `store: false` on EVERY call (customer text,
//   slips). Never sends `temperature`, `top_p`, `top_logprobs` or `user`.
// * Model ids come from env only; features pick an alias, never an id:
//     (team decision 20 Nov: all three aliases default to gpt-6.2-sol; env may lower one later without code changes)
//     'chat'   → OPENAI_CHAT_MODEL        (default gpt-6.2-sol)    replies + tool loop, vision (slips), insights, hard extraction
//     'fast'   → OPENAI_CHAT_MODEL_FAST   (default gpt-6.2-sol)    classifier, field extraction, rerank, summary, translate
//     'strong' → OPENAI_CHAT_MODEL_STRONG (default gpt-6.2-sol)    F10 retry only (≤ 1 per turn)
//   embed → OPENAI_EMBED_MODEL (text-embedding-3-large) sent with `dimensions: EMBED_DIM` (1536) ·
//   moderate → OPENAI_MODERATION_MODEL (omni-moderation-latest) · transcribe → OPENAI_TRANSCRIBE_MODEL (gpt-transcribe) ·
//   realtime → OPENAI_REALTIME_MODEL (gpt-realtime-2.1), OPENAI_REALTIME_VOICE (marin),
//   OPENAI_REALTIME_TRANSCRIBE_MODEL (gpt-live-transcribe) · OPENAI_TTS_MODEL stays empty (unused).
//   Limits: MODEL_TIMEOUT_MS (20000) · MODEL_MAX_OUTPUT_TOKENS (2000, includes reasoning tokens).
// * EVERY call of every method, success or failure, writes one model_usage row (featureId, purpose, business /
//   conversation / turn ids, model, mode, tokens, cost from MODEL_PRICE_TABLE, latency, OpenAI response id +
//   x-request-id, finish reason or error code). That is cost tracking for F27, not a quota: usage never blocks a call.
// * MODEL_MODE=fake (forced when NODE_ENV=test and in CI, default when OPENAI_API_KEY is empty): deterministic, no
//   network, still writes model_usage (costUsdMicros 0, costReason 'fake_mode'). Per-method fake behavior = its @fake.
// * Errors (every method). "Retry once" = one retry inside the SAME deadline (timeoutMs), never more:
//     timeout / abort / 5xx / APIConnectionError        → retry once → AppError('PROVIDER_UNAVAILABLE', retryable true)
//     400 (bad schema or parameter) · 401 · 403          → no retry   → AppError('PROVIDER_UNAVAILABLE', retryable false), logged
//     429 insufficient_quota family (credit_balance_exhausted, project_spend_limit_exceeded,
//         organization_spend_limit_exceeded, organization_usage_limit_exceeded)
//                                                        → NO retry   → AppError('PROVIDER_BUDGET_EXHAUSTED', retryable false)
//     other 429 (rate limit, slow_down) / 503 server_is_overloaded
//                                                        → retry once after Retry-After + jitter → AppError('RATE_LIMITED', retryable true)
//   The model_usage row is still written for a failure (error code set, tokens null, costReason 'provider_error').

export interface UsageAttribution {
  featureId: FeatureId;
  /**
   * Short label, e.g. 'reply', 'classify', 'extract', 'rerank', 'summarize', 'translate', 'slip-read',
   * 'embed-document', 'embed-query', 'moderate', 'transcribe', 'voice.session', 'voice.turn', 'voice.transcribe'.
   */
  purpose: string;
  businessId: string | null;
  accountId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
}
export interface ModelToolCall {
  /** OpenAI `call_id` of the function_call item. Answer it with { role: 'tool', toolCallId: <this id> }. */
  id: string;
  name: string;
  /**
   * JSON.parse of the function_call `arguments` string ({} when it does not parse). Validate with zod before use:
   * model output is data, not authority.
   */
  arguments: Record<string, unknown>;
}
/**
 * One input content part. Core maps it to a Responses input item: text → input_text · image → input_image
 * { image_url: <data URL>, detail } · file → input_file { filename, file_data: <data URL> }.
 * Image and file parts only in 'user' messages. Give exactly one of dataUrl / uploadRef. uploadRef = core `files` id
 * (StoredFile.id): core reads it with storage.read(id, { businessId: usage.businessId }) (missing or another business's
 * file → VALIDATION_ERROR) and sends it as base64. Never a URL taken from a customer, a web page or model text.
 * Images: PNG / JPEG / WEBP / non-animated GIF (slips: detail 'high'). Files: PDF, < 50 MB in total per request.
 */
export type ModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl?: string; uploadRef?: string; detail?: 'low' | 'high' | 'auto' }
  | { type: 'file'; filename: string; dataUrl?: string; uploadRef?: string };
/**
 * 'developer' = rules; it replaces 'system' ('system' is still accepted as an alias and sent as 'developer'). Put the
 * stable rules in the FIRST developer message (not `instructions`) so the prefix hits the prompt cache.
 * 'tool' = the result of one ModelToolCall → sent as function_call_output { call_id: toolCallId, output: content }
 * (content = JSON string of the result).
 */
export type ModelMessage =
  | { role: 'developer' | 'system' | 'user'; content: string | ModelContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };
export interface ModelTool {
  name: string;
  description: string;
  /**
   * JSON Schema of the arguments, written for strict mode: every property listed in `required`,
   * `additionalProperties: false` on every object, optional fields typed as a union with "null".
   */
  parameters: JsonSchema;
  /** Sent as the function tool's `strict`. Default true. */
  strict?: boolean;
}
export interface ModelChatInput {
  usage: UsageAttribution;
  /** 'chat' (default) = OPENAI_CHAT_MODEL · 'fast' = OPENAI_CHAT_MODEL_FAST · 'strong' = OPENAI_CHAT_MODEL_STRONG. */
  model?: 'chat' | 'fast' | 'strong';
  messages: ModelMessage[];
  tools?: ModelTool[];
  /** → tool_choice ({ name } forces that function). parallel_tool_calls stays true. */
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  /**
   * Structured Outputs → text.format { type: 'json_schema', name, schema, strict } (strict default true, same schema
   * rules as ModelTool.parameters). Result.json = JSON.parse(output_text); still validate it with zod.
   */
  responseFormat?: { name: string; schema: JsonSchema; strict?: boolean };
  /**
   * → reasoning.effort. Default 'low' for 'chat' and 'strong', 'none' for 'fast'. Core sends 'low' instead of 'none'
   * to models that reject 'none' (gpt-6.2-*, i.e. the 'strong' default). There is no temperature parameter.
   */
  reasoningEffort?: 'none' | 'low' | 'medium';
  /** → max_output_tokens. Default MODEL_MAX_OUTPUT_TOKENS (2000). INCLUDES reasoning tokens. Minimum 16. */
  maxOutputTokens?: number;
  /** Default MODEL_TIMEOUT_MS (20000). The single retry must fit inside it. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Tool loop: pass the previous round's ModelChatResult.providerState back unchanged (omit it on the first round).
   * It carries the provider's reasoning + function_call items, which store:false means OpenAI cannot look up by id;
   * core replays them in front of the matching { role: 'tool' } messages so reasoning survives the loop. Keep the
   * assistant toolCalls message and the tool messages in `messages` as well (traces and fake mode read them).
   */
  providerState?: unknown;
  /** MODEL_MODE=fake only: scripted output for tests. Ignored in openai mode. */
  fake?: { text?: string; json?: unknown; toolCalls?: ModelToolCall[] };
}
export interface ModelUsage {
  /** usage.input_tokens (includes cached and cache-write tokens). Realtime: text + audio input tokens. */
  inputTokens: number | null;
  /** usage.output_tokens (includes reasoningTokens). */
  outputTokens: number | null;
  /** usage.input_tokens_details.cached_tokens */
  cachedInputTokens: number | null;
  /** usage.input_tokens_details.cache_write_tokens (billed 1.25 × input at the default 30-minute TTL). */
  cacheWriteTokens: number | null;
  /** usage.output_tokens_details.reasoning_tokens (already inside outputTokens, billed as output). */
  reasoningTokens: number | null;
  /**
   * USD × 1e6 from MODEL_PRICE_TABLE (per 1M tokens): (input − cached − cacheWrite) × input + cached × cachedInput
   * + cacheWrite × input × 1.25 + output × output. Realtime prices text and audio tokens separately (audio* rates).
   * null when the price table has no rate for the model (never 0 for unknown). Fake mode: 0.
   */
  costUsdMicros: number | null;
  costReason: 'priced' | 'no_rate' | 'fake_mode' | 'provider_error';
}
export interface ModelChatResult {
  /** output_text ('' on a refusal). */
  text: string;
  json?: unknown;
  toolCalls: ModelToolCall[];
  /**
   * 'tool_calls' = the output has function_call items · 'content_filter' = a refusal content item (or incomplete
   * reason 'content_filter') · 'length' = status 'incomplete' + incomplete_details.reason 'max_output_tokens' ·
   * else 'stop'.
   */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Resolved model id, e.g. 'gpt-6.2-sol'. */
  model: string;
  mode: 'openai' | 'fake';
  usage: ModelUsage;
  usageId: string;
  latencyMs: number;
  /** x-request-id of the response (OpenAI response id is kept on the model_usage row). null in fake mode. */
  requestId: string | null;
  /** Opaque. Set when finishReason is 'tool_calls': pass it back as ModelChatInput.providerState next round. */
  providerState?: unknown;
}
export interface ModelEmbedInput {
  usage: UsageAttribution;
  texts: string[];
  /** Labels usage only: documents and queries use the same model (no input_type). */
  purpose: 'document' | 'query';
}
export interface ModelEmbedResult {
  /** One vector per input text, length EMBED_DIM (1536), L2-normalized. */
  vectors: number[][];
  dim: number;
  model: string;
  mode: 'openai' | 'fake';
  usage: ModelUsage;
  usageId: string;
}
export interface ModelModerateInput {
  usage: UsageAttribution;
  text?: string;
  /** Exactly one of dataUrl / uploadRef per image (uploadRef read with usage.businessId, like ModelContentPart). ≤ 20 MB each. */
  images?: { dataUrl?: string; uploadRef?: string }[];
}
export interface ModelModerateResult {
  flagged: boolean;
  /** Categories whose flag is true, e.g. 'harassment', 'hate', 'illicit', 'self-harm', 'sexual', 'violence/graphic'. */
  categories: string[];
  model: string;
  mode: 'openai' | 'fake';
  usageId: string;
}
export interface ModelTranscribeInput {
  usage: UsageAttribution;
  /**
   * Exactly one of uploadRef / bytes. filename MUST carry the extension (flac mp3 mp4 mpeg mpga m4a ogg wav webm);
   * ≤ 25 MB.
   */
  audio: { uploadRef?: string; bytes?: Uint8Array; filename: string };
  /** Default ['th']. */
  languages?: string[];
}
export interface ModelTranscribeResult {
  text: string;
  /** usage.seconds when OpenAI reports a duration, else null. */
  seconds: number | null;
  model: string;
  mode: 'openai' | 'fake';
  usageId: string;
}
export interface ModelRealtimeSessionInput {
  usage: UsageAttribution;
  businessId: string;
  /** Hashed (sha256) into the OpenAI-Safety-Identifier header. null = staff test session without a customer. */
  customerId: string | null;
  /** Thai shop instructions: answer in Thai only, keep it short, use the tools for facts. */
  instructions: string;
  /** Same tool names and schemas as the F10 chat tools. They run on OUR server (F30 tools route), never at OpenAI. */
  tools: ModelTool[];
  /** Client secret lifetime in seconds, 10–7200. Default 600. */
  ttlSeconds?: number;
}
export interface ModelRealtimeSession {
  /** Ephemeral key ('ek_…') for the browser's POST /v1/realtime/calls. The only OpenAI credential that may reach a browser. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
}
export interface ModelRealtimeUsageInput {
  usage: UsageAttribution;
  /**
   * response.done → response.usage as relayed by the browser. CLIENT-REPORTED: core validates the shape with zod and
   * rejects negative or non-integer counts. The caller (F30) dedups per realtime response id before calling.
   */
  responseUsage: unknown;
}
/** One MODEL_PRICE_TABLE entry: USD per 1M tokens, Standard tier (docs/openai-api.md §1.1, realtime §10.1). */
export interface ModelPriceRate {
  input: number;
  cachedInput: number;
  output: number;
  /** Realtime models only: audio token rates (their text tokens use input / cachedInput / output). */
  audioInput?: number;
  audioCachedInput?: number;
  audioOutput?: number;
}
/** MODEL_PRICE_TABLE parsed: model id → rate. A model id that is missing → costUsdMicros null + costReason 'no_rate'. */
export type ModelPriceTable = Record<string, ModelPriceRate>;

export interface ModelApi {
  /**
   * One Responses round: openai.responses.create({ model, input, tools, tool_choice, parallel_tool_calls: true,
   * reasoning: { effort }, text: { verbosity: 'low', format? }, max_output_tokens, store: false,
   * prompt_cache_key: `biz:<businessId>`, safety_identifier: sha256(conversationId ?? businessId),
   * metadata: { purpose, feature_id, conversation_id } }).
   * The CALLER runs the tool loop (F10: ≤ 4 tool calls per turn, then answer from what it has):
   *   r = chat({ messages, tools }); while r.finishReason === 'tool_calls': run each r.toolCalls[i] on our server,
   *   append { role: 'assistant', content: r.text, toolCalls: r.toolCalls } + one { role: 'tool', toolCallId, content }
   *   per call, then r = chat({ messages, tools, providerState: r.providerState }).
   * OpenAI never truncates input (truncation 'disabled' → too long = 400): callers keep messages bounded (getHistory limit).
   * @fake text = input.fake?.text ?? `[fake-model:${usage.purpose}] ` + the last user message's text (text parts joined
   *   with ' ', first 200 chars); json = input.fake?.json; toolCalls = input.fake?.toolCalls ?? [];
   *   finishReason 'tool_calls' + providerState { fake: true } when toolCalls is non-empty, else 'stop' (no providerState);
   *   model = the id the alias maps to; latencyMs 0; requestId null; usage tokens null, costUsdMicros 0,
   *   costReason 'fake_mode'. Deterministic, no network.
   */
  chat(input: ModelChatInput): Promise<ModelChatResult>;
  /**
   * openai.embeddings.create({ model: OPENAI_EMBED_MODEL, input, dimensions: EMBED_DIM }) in batches of ≤ 256 texts
   * (a text over 8,192 tokens → VALIDATION_ERROR). Vectors are unit length → pgvector cosine distance `<=>`.
   * Never mix two embedding models in one index: changing OPENAI_EMBED_MODEL or EMBED_DIM means re-embedding everything.
   * @fake MODEL_MODE=fake: deterministic hashing embedding, dim EMBED_DIM —
   *   tokens = lowercase Latin/digit words (split on non-alphanumerics, SKU kept whole e.g. "a-game-01")
   *            + Thai character bigrams (Thai has no spaces);
   *   for each token: i = fnv1a32(token) % dim; v[i] += (fnv1a32('#' + token) & 1) ? 1 : -1; then L2-normalize
   *   (all-zero → v[0] = 1). Same text → same vector; shared words/bigrams → higher cosine.
   */
  embed(input: ModelEmbedInput): Promise<ModelEmbedResult>;
  /**
   * openai.moderations.create({ model: OPENAI_MODERATION_MODEL, input: [{ type: 'text', text },
   * { type: 'image_url', image_url: { url } }, …] }). Free. flagged = any result flagged. Used by F05 / F06 / F12 on
   * what a shop uploads; a warning signal (Thai coverage is not documented), not the only gate. Neither text nor
   * images → VALIDATION_ERROR.
   * @fake flagged = (text ?? '').includes('[flag]'); categories = flagged ? ['fake'] : []. No network.
   */
  moderate(input: ModelModerateInput): Promise<ModelModerateResult>;
  /**
   * openai.audio.transcriptions.create({ model: OPENAI_TRANSCRIBE_MODEL, file: toFile(bytes, filename), languages })
   * for voice-message files from LINE / Messenger / Instagram (F09 / F17 / F18, stretch; the channel owner decides).
   * Missing or oversize audio, or a filename without a supported extension → VALIDATION_ERROR.
   * @fake text `[fake-transcript] <filename>`, seconds null. No network.
   */
  transcribe(input: ModelTranscribeInput): Promise<ModelTranscribeResult>;
  /**
   * F30 voice. POST /v1/realtime/client_secrets (Authorization: Bearer OPENAI_API_KEY, OpenAI-Safety-Identifier:
   * sha256(customerId ?? businessId); never the retired `OpenAI-Beta: realtime=v1` header) with
   * expires_after { anchor: 'created_at', seconds: ttlSeconds } and session { type: 'realtime',
   * model: OPENAI_REALTIME_MODEL, instructions, output_modalities: ['audio'], reasoning: { effort: 'low' },
   * max_output_tokens: 1024, tools: [{ type: 'function', name, description, parameters }], tool_choice: 'auto',
   * audio: { input: { transcription: { model: OPENAI_REALTIME_TRANSCRIBE_MODEL, languages: ['th'] },
   * turn_detection: { type: 'server_vad', silence_duration_ms: 600, create_response: true, interrupt_response: true },
   * noise_reduction: { type: 'far_field' } }, output: { voice: OPENAI_REALTIME_VOICE } } }.
   * Returns ONLY the secret value + expires_at (never OPENAI_API_KEY). The caller binds it to its own server-side
   * voiceSessionId (VoiceSession). Writes a model_usage row for the mint (no tokens; costUsdMicros 0, 'priced');
   * the conversation's cost arrives through recordRealtimeUsage.
   * @fake clientSecret `fake-ek-<uuid>` (random uuid: tests assert the `fake-ek-` prefix only), expiresAt = now +
   *   ttlSeconds (600), model = OPENAI_REALTIME_MODEL, voice = OPENAI_REALTIME_VOICE. No network (a browser cannot
   *   connect with it, so F30 in fake mode is at most A).
   */
  createRealtimeSession(input: ModelRealtimeSessionInput): Promise<ModelRealtimeSession>;
  /**
   * F30 voice. Stores one response.done usage (input_tokens, output_tokens, input_token_details.{text_tokens,
   * audio_tokens, image_tokens, cached_tokens}, output_token_details.{text_tokens, audio_tokens}) as a model_usage row
   * (purpose e.g. 'voice.turn'; live-transcription usage the same way with 'voice.transcribe'), priced with the
   * realtime text + audio rates of MODEL_PRICE_TABLE. Bad shape → VALIDATION_ERROR, nothing written.
   * @fake same validation; writes the row with costUsdMicros 0 / 'fake_mode' and returns its id.
   */
  recordRealtimeUsage(input: ModelRealtimeUsageInput): Promise<{ usageId: string }>;
}
/** @owner F01 core · C1 */
export declare const model: ModelApi;

// ---- channels (server/src/core/channels.ts) ----

export interface OutboundDelivery {
  messageId: string;
  conversationId: string;
  businessId: string;
  channel: Channel;
  customerExternalId: string;
  channelAccountId: string | null;
  parts: MessagePart[];
  /** provider_meta of the latest inbound message (e.g. LINE replyToken + expiry, Meta 24-hour messaging window). */
  lastInboundMeta: Record<string, unknown>;
  attempt: number;
}
export interface DeliveryResult {
  state: 'sent' | 'failed' | 'unknown';
  mode: DeliveryMode;
  externalRef?: string | null;
  /** Sandbox senders set this instead of externalRef. */
  simulatedRef?: string | null;
  error?: string;
  /** failed + retryable → the deliver job retries. 'unknown' is never blind-retried (SPEC §7). */
  retryable?: boolean;
}
export interface ChannelSender {
  channel: Channel;
  mode: DeliveryMode;
  send(delivery: OutboundDelivery): Promise<DeliveryResult>;
}
export interface SendToCustomerOptions {
  /**
   * Already saved with inbox saveMessage({ direction: 'outbound' })? Pass its id: core delivers that row
   * and does NOT insert again (the F10 ai.reply flow does this). Omit it: core saves the message first
   * via inbox saveMessage, then delivers.
   */
  messageId?: string;
  author?: Exclude<MessageAuthor, 'customer'>;
  authorUserId?: string | null;
  origin?: MessageOrigin;
  clientRequestId?: string;
  /** Assert tenant: conversation of another business → NOT_FOUND. */
  businessId?: string;
}
export interface SendReceipt {
  messageId: string;
  conversationId: string;
  channel: Channel;
  jobId: string;
  delivery: { mode: DeliveryMode; state: 'pending' };
}
/**
 * @owner F01 core · C1 (registry). Channel senders: 'web' (core, Demo Chat), 'line' (F17 · C2),
 * 'facebook' / 'instagram' (F18 · C2). There are no other channels.
 * Persist-before-send: (save via inbox saveMessage unless opts.messageId) → messages.delivery_state 'pending'
 * → jobs.enqueue('core.deliver', { messageId }, { dedupKey: `deliver:${messageId}`, lockKey: `conversation:${id}` })
 * → worker calls the registered sender → updates delivery_* → publish 'message.updated'.
 * Unknown conversation → NOT_FOUND. Returns before delivery (state 'pending').
 * At setup core registers: 'web' (mode 'real', in-app: marks 'sent' + realtime) and SANDBOX CAPTURE senders
 * for line/facebook/instagram (mode 'sandbox', state 'sent', simulatedRef `sandbox-<messageId>`,
 * logs the parts). C2 replaces them with registerChannelSender.
 */
export declare function sendToCustomer(conversationId: string, parts: MessagePart[], opts?: SendToCustomerOptions): Promise<SendReceipt>;

/** @owner F01 core · C1. Sync. Last registration wins (logs a warning). Call it from your feature's register(). */
export declare function registerChannelSender(channel: Channel, sender: ChannelSender): void;

// ---- realtime (server/src/core/realtime.ts) ----

/**
 * @owner F01 core · C1. Push to WebSocket clients subscribed to `businessId` (membership checked at subscribe).
 * `opts.userIds` narrows to those users (notifications). Fire-and-forget: never throws, never blocks a request.
 */
export declare function publish(businessId: string, event: RealtimeEvent, opts?: { userIds?: string[] }): void;

// ---- storage (server/src/core/storage.ts) — local disk under UPLOAD_DIR + core `files` table ----

export interface StoredFile {
  id: string;
  businessId: string;
  purpose: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}
export interface StorageApi {
  /** Checks size (UPLOAD_MAX_MB) and `allowedMime`. Rejects with VALIDATION_ERROR. */
  save(input: { businessId: string; uploadedBy: string | null; purpose: string; originalName: string; mimeType: string; bytes: Uint8Array; allowedMime?: string[] }): Promise<StoredFile>;
  /** Null when missing or another business's file (R3). */
  read(fileId: string, opts: { businessId: string }): Promise<{ file: StoredFile; bytes: Uint8Array } | null>;
}
/** @owner F01 core · C1 */
export declare const storage: StorageApi;

/** @owner F01 core · C1. Append-only audit row (ops actions, permission changes, deletes). Never store secrets. */
export declare function audit(input: { action: string; actorUserId: string | null; businessId?: string | null; accountId?: string | null; targetType?: string; targetId?: string; details?: Record<string, unknown>; requestId?: string }): Promise<void>;

// ---- rate limit, secrets at rest, feature flags (server/src/core/ratelimit.ts, crypto.ts, flags.ts) — added in v3 ----

/**
 * @owner F01 core · C1. In-memory fixed-window counter per process (one production instance, so that is enough).
 * `key` must already contain the scope, e.g. `demo-chat:visitor:<id>`, `webhook:line:<channelId>`, `login:<ip>`.
 * Use it for every public or unauthenticated route (Demo Chat, webhooks, login, MCP, feed).
 * @fake same real implementation (no fake needed).
 */
export declare function rateLimit(input: { key: string; limit: number; windowSeconds: number }): { allowed: boolean; remaining: number; retryAfterSeconds: number };
/** @owner F01 core · C1. rateLimit() that throws AppError('RATE_LIMITED') (HTTP 429, details.retryAfterSeconds) when not allowed. */
export declare function assertRateLimit(input: { key: string; limit: number; windowSeconds: number }): void;

/**
 * @owner F01 core · C1. AES-256-GCM with TOKEN_ENCRYPTION_KEY (32 bytes, base64). Output format `enc:v1:<iv>:<tag>:<ciphertext>`
 * (base64url parts). Every provider token, channel secret, OAuth refresh token and payment setting is stored through this.
 * decryptSecret throws AppError('INTERNAL') on a wrong key or tampered value; never log either side.
 */
export declare function encryptSecret(plain: string): string;
export declare function decryptSecret(token: string): string;

/**
 * @owner F01 core · C1. true when the feature is hidden by the ops page / HIDDEN_FEATURES (DECISIONS D6). Hiding affects
 * the WEB only (menu + routes); feature APIs and webhooks keep answering. Features normally do not need to call this.
 */
export declare function isFeatureHidden(featureId: FeatureId): Promise<boolean>;

// ---- F35 core/jobs additions (v3): test helper, redaction, upload guard, honest send errors ----

/**
 * @owner F35 core/jobs · C1 · consumers: every lane's tests, F36 smoke.
 * Runs the worker in-process until no job is runnable (state queued with run_at <= now, or reclaimable) or `maxMs`
 * (default 20000) passes. Only for NODE_ENV=test / MODEL_MODE=fake test helpers; throws AppError('POLICY_BLOCKED') in production.
 */
export declare function drainJobs(opts?: { type?: string; maxMs?: number }): Promise<{ ran: number; dead: number }>;
/**
 * @owner F35 core/jobs · C1 · consumers: F31 (job dead → notify) and any feature that stores text in last_error, logs or audit.
 * Removes bearer tokens, API keys (sk-…), JWTs, connection strings, long base64/hex, `key=value` secrets, Thai phone
 * numbers and e-mail addresses. Never throws.
 */
export declare function redactText(input: string, maxLen?: number): string;
export declare function redactObject<T>(input: T, opts?: { maxStringLen?: number }): T;
/**
 * @owner F35 core/jobs · C1 · consumers: core storage.save and every upload route.
 * Throws VALIDATION_ERROR (details.reason 'too_large' | 'mime_not_allowed' | 'mime_mismatch').
 */
export declare function assertUploadAllowed(input: { purpose: string; mimeType: string; size: number; bytes?: Uint8Array }): { mimeType: string };
/**
 * Error a ChannelSender (C2: line / facebook / instagram) throws so that core.deliver knows whether the provider may
 * have received the request: definitelyNotSent false → delivery state 'unknown' (never retried blindly).
 */
export declare class ChannelSendError extends Error {
  constructor(message: string, opts: { code: string; definitelyNotSent: boolean; retryable: boolean; providerStatus?: number });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: server/src/core/features.ts — server auto-loader contracts (routes, jobs, migrations, seeds) ═══
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ---- FeatureRoutes: `export default defineFeatureRoutes({...})` in server/src/features/<slug>/routes.ts ----

export interface UploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}
export interface RouteOptions<B = unknown, Q = unknown> {
  /**
   * 'none' public · 'user' session required (ctx.user) · 'business' path MUST contain `:businessId`,
   * core runs getBusiness + (permission) and sets ctx.business/ctx.scope · 'platform_admin' requirePlatformAdmin
   * (F35 ops routes only).
   * Routes without :businessId whose resource belongs to a business (e.g. /conversations/:id) use 'user'
   * and call ctx.requireBusiness(resource.businessId, key) before reading anything else.
   */
  auth: 'none' | 'user' | 'business' | 'platform_admin';
  permission?: PermissionKey;
  /** Parsed and validated before the handler; failure → 400 VALIDATION_ERROR with issues in details. */
  body?: SchemaLike<B>;
  query?: SchemaLike<Q>;
  /** multipart via multer (memory). Files appear in ctx.files. */
  upload?: { field: string; maxFiles?: number; maxMb?: number; accept?: string[] };
  /** One-line purpose: shown in the protocol catalog (/api/v1/_meta/routes, F35 SheetBot replacement). */
  summary?: string;
}
export interface RouteContext<B = unknown, Q = unknown> {
  req: RequestLike;
  /**
   * The response, for cookies only (added in v3): F02 login / signup / invitation-accept call
   * createSession(userId, kind, ctx.res) and logout calls destroySession(ctx.req, ctx.res); the public Demo Chat may set
   * its visitor cookie. Handlers never write the body or status through it: they return a value or an HttpResponse.
   */
  res: ResponseLike;
  requestId: string;
  params: Record<string, string>;
  body: B;
  query: Q;
  files: UploadedFile[];
  /** Set for auth 'user' | 'business' | 'platform_admin'. */
  user: AuthUser | null;
  /** Set for auth 'business'. */
  business: BusinessRecord | null;
  scope: AuthScope | null;
  /** getBusiness(req, businessId) + optional requirePermission; sets ctx.business/ctx.scope. */
  requireBusiness(businessId: string, permission?: PermissionKey): Promise<BusinessContext>;
}
/** Non-200 or non-JSON responses. Plain return value = 200 ApiResult. */
export type HttpResponse<T> =
  | { kind: 'json'; status: 201 | 202 | 200; data: T }
  | { kind: 'no_content' }
  | { kind: 'redirect'; location: string }
  | { kind: 'file'; bytes: Uint8Array; mimeType: string; fileName?: string; inline?: boolean };
export type RouteHandler<B, Q, R> = (ctx: RouteContext<B, Q>) => Promise<R | HttpResponse<R>>;

export interface WebhookContext {
  /** Exact bytes for signature checks (LINE x-line-signature, Meta x-hub-signature-256). */
  rawBody: Uint8Array;
  text: string;
  json: unknown;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  requestId: string;
}
export interface WebhookResult {
  status: number;
  body?: string | Record<string, unknown>;
  contentType?: string;
}
export type WebhookHandler = (ctx: WebhookContext) => Promise<WebhookResult>;

/**
 * Passed to register(). Paths are relative to `/api/v1` (e.g. '/businesses/:businessId/catalog/items').
 * Core wraps the return value in ApiResult, maps AppError → ApiFailure, enforces CSRF (header
 * `X-Requested-With: nless` + Origin check) on state-changing session routes, and records every route
 * for the protocol catalog. A (method, path) already registered by another feature fails boot naming both.
 */
export interface FeatureApi {
  get<Q = unknown, R = unknown>(path: string, opts: RouteOptions<never, Q>, handler: RouteHandler<never, Q, R>): void;
  post<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  put<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  patch<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  delete<Q = unknown, R = unknown>(path: string, opts: RouteOptions<never, Q>, handler: RouteHandler<never, Q, R>): void;
  /**
   * Mounted at `/webhooks<path>` (e.g. api.webhook('POST', '/line/:channelId', h)). No session, no CSRF,
   * raw body kept. Verify the provider signature in the handler. Do heavy work in a job; answer fast.
   */
  webhook(method: 'GET' | 'POST', path: string, handler: WebhookHandler): void;
}

/** What server/src/features/<slug>/routes.ts default-exports. Core loads every features/*\/routes.ts at boot. */
export interface FeatureRoutes {
  featureId: FeatureId;
  slug: FolderSlug;
  /** Register HTTP routes, webhooks and channel senders. Runs once at boot. */
  register(api: FeatureApi): void | Promise<void>;
  /** Job handlers by job type (e.g. { 'ai.reply': handler }). A type declared by two features fails boot. */
  jobs?: Record<string, JobHandler>;
  schedules?: ScheduleDefinition[];
  /**
   * Added in v3 (F39 MCP server). Called once at boot after /api and /webhooks are mounted and before the SPA fallback.
   * The feature mounts handlers only under its own fixed prefix (F39: '/mcp'); core fails the boot when two features
   * mount the same prefix. Test apps mount it too, so supertest can reach it.
   */
  mountExpress?(app: ExpressAppLike): void;
}
/** Identity helper for typing: `export default defineFeatureRoutes({ ... })`. */
export declare function defineFeatureRoutes(def: FeatureRoutes): FeatureRoutes;

// ---- FeatureMigration: server/src/features/<slug>/migrations/NNN_<snake_name>.sql ----

/**
 * File rules (runner = server/src/core/migrate.ts, `npm run db:migrate`):
 *  - Path: server/src/features/<slug>/migrations/NNN_<snake_name>.sql, NNN = 001, 002 … per feature.
 *    Core (F01+F35): server/src/core/migrations/NNN_<name>.sql, owner 'core'.
 *  - First line REQUIRED: `-- dependsOn: core, catalog` (MigrationOwner list; 'core' is always implied).
 *  - Order: topological over owners (union of their files' dependsOn), ties by slug; inside an owner by NNN.
 *    Cycle or unknown slug → runner fails with the cycle/slug. A dependency with zero migration files yet
 *    → warning, continue (its fake needs no table).
 *  - Each file runs in one transaction; applied ids go to schema_migrations(id, owner, checksum, applied_at).
 *    An applied file whose checksum changed → runner fails: add a new NNN file instead (own lane DB:
 *    `npm run db:reset`).
 *  - Create only your own tables. FK only to core tables or to tables of owners in dependsOn. Never
 *    ALTER/DROP core tables or another feature's tables. Cross-feature id without dependsOn → plain uuid
 *    column + index, no FK.
 */
export interface FeatureMigration {
  /** `<owner>/<file name>`, e.g. 'catalog/001_catalog_items.sql'. */
  id: string;
  owner: MigrationOwner;
  seq: number;
  name: string;
  dependsOn: MigrationOwner[];
  sql: string;
  checksum: string;
}

// ---- FeatureSeed: server/src/features/<slug>/seed.ts (optional) ----

export interface SeedContext {
  db: DbClient;
  fixtures: SeedData;
  /** alias → deterministic uuid (from SEED; also written to core table seed_aliases). */
  id(alias: string): string;
  log(message: string): void;
}
/**
 * `npm run db:seed` runs core seed, then every features/*\/seed.ts in dependsOn order.
 * Must be idempotent (INSERT … ON CONFLICT DO NOTHING) and use only SEED data.
 */
export interface FeatureSeed {
  featureId: FeatureId;
  dependsOn: MigrationOwner[];
  run(ctx: SeedContext): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: shared/core/loader.ts — web auto-loader contracts (pages, menu, slots) + web core API types ═══
// defineFeaturePages() and the WebCore functions are implemented in web/src/core (index.ts).
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ---- FeaturePages: `export default defineFeaturePages({...})` in web/src/features/<slug>/pages.tsx ----

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
export declare function defineFeaturePages(def: FeaturePages): FeaturePages;

// ---- web core API (web/src/core/index.ts) used by every feature page ----

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══ target: web/src/core/types.ts — WebCore + UI kit (F01 · C1). React types: web only, NOT copied to shared ═══
// ReactNodeLike → React.ReactNode. Components/hooks live in web/src/core/ui/*, exported from web/src/core/index.ts.
// Feature pages use these (+ PageHeader, formatMoney, formatDateTime) instead of their own tables, dialogs, toasts or
// fetch hooks (AGENTS.md §4, patterns in docs/COOKBOOK.md). MUI 9 only. Default texts: core i18n namespace `common`.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface DataTableColumn<T> {
  /** Unique per table. Without `render` the cell shows `row[key]` (null/undefined → '—'). */
  key: string;
  /** Already translated, e.g. t('catalog:table.name'). */
  header: string;
  render?: (row: T) => ReactNodeLike;
  width?: number | string;
  /** Default 'left'; money/number columns 'right'. Applies to header and cells. */
  align?: 'left' | 'right' | 'center';
}
/**
 * MUI Table (size small) in an outlined Paper. TableContainer overflowX auto + nowrap headers: on phones the table
 * scrolls horizontally instead of squeezing columns. No built-in sort/paging (pass sorted rows, e.g. Page<T>.items;
 * put "load more" below the table).
 * loading → LinearProgress above the header + aria-busy; no rows yet → 3 skeleton rows.
 * !loading && rows = [] → one full-width row: `empty` ?? <EmptyState title={t('common:table.empty')} /> ('ยังไม่มีข้อมูล').
 * onRowClick → hover style, pointer cursor, tabIndex 0, Enter/Space = click.
 */
export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNodeLike;
  onRowClick?: (row: T) => void;
}
export declare function DataTable<T>(props: DataTableProps<T>): ReactNodeLike;

/**
 * Create/edit form in a Dialog: fullWidth, maxWidth 'sm', fullScreen below 'sm'; aria-labelledby = title.
 * Fields = MUI inputs passed as children (stacked, spacing 2; the caller puts autoFocus on the first one).
 * Content sits in <form noValidate>: Enter or the submit button → onSubmit (preventDefault).
 * Buttons: cancel (common:actions.cancel 'ยกเลิก') → onClose · submit (submitLabel ?? common:actions.save 'บันทึก').
 * submitting → both buttons disabled + spinner on submit; Esc/backdrop do nothing.
 * error → Alert severity 'error' above the fields (form-level text; API errors are already toasted by useApiMutation).
 * Never closes itself: the caller closes after success. A rejected onSubmit is swallowed and the dialog stays open.
 */
export interface FormDialogProps {
  open: boolean;
  title: string;
  submitLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
  children: ReactNodeLike;
}
export declare function FormDialog(props: FormDialogProps): ReactNodeLike;

/**
 * Yes/no Dialog: maxWidth 'xs', fullWidth (stays compact on phones: a two-line question needs no full screen).
 * message in DialogContentText. confirmLabel ?? (danger ? common:actions.delete 'ลบ' : common:actions.confirm 'ยืนยัน');
 * cancel = common:actions.cancel. danger → confirm button color 'error' and initial focus on cancel.
 * Awaits onConfirm with its own pending state (both buttons disabled + spinner) → resolved: calls onClose() ·
 * rejected: stays open (useApiMutation already toasted).
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNodeLike;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}
export declare function ConfirmDialog(props: ConfirmDialogProps): ReactNodeLike;

/** Centered block (py 6): icon (default InboxOutlined, text.secondary) · title · description (body2, text.secondary) · action (e.g. a create Button). */
export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNodeLike;
  action?: ReactNodeLike;
}
export declare function EmptyState(props: EmptyStateProps): ReactNodeLike;

export type StatusChipKind = 'feature' | 'order' | 'payment' | 'conversation' | 'generic';
/** MUI Chip `color`. */
export type StatusChipColor = 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
/**
 * Chip size small. kind default 'generic'. Colour from the map below (status not in the map → 'default'), also rendered
 * as `data-color={color}` for tests. Text = label ?? t(`common:status.<kind>.<status>`, { defaultValue: status }).
 * Map (status colour 'Thai label'; common.json en gets the English pair):
 *   feature (AGENTS.md §9): R success 'จริง (R)' · S info 'Sandbox (S)' · A warning 'Adapter (A)' · U default 'ยังไม่ทำ (U)'
 *   order (OrderSummary.status): awaiting_payment warning 'รอชำระเงิน' · paid success 'ชำระแล้ว' · preparing info 'กำลังเตรียม' ·
 *     shipped primary 'จัดส่งแล้ว' · delivered success 'ส่งถึงแล้ว' · cancelled default 'ยกเลิก'
 *   payment (OrderSummary.paymentState): unpaid warning 'ยังไม่ชำระ' · pending_verification info 'รอตรวจสลิป' ·
 *     paid success 'ชำระแล้ว' · refunded default 'คืนเงินแล้ว'
 *   conversation (ConversationRecord.status / .handler): open info 'เปิดอยู่' · closed default 'ปิดแล้ว' ·
 *     ai secondary 'AI ตอบ' · human warning 'พนักงานตอบ'
 *   generic (JobState, KnowledgeStatus, KnowledgeIndexState, DeliveryState, AppointmentSummary.status, …):
 *     active success 'ใช้งาน' · ready success 'พร้อม' · sent success 'ส่งแล้ว' · succeeded success 'สำเร็จ' ·
 *     completed success 'เสร็จแล้ว' · running info 'กำลังทำ' · indexing info 'กำลังทำดัชนี' · reviewed info 'ตรวจแล้ว' ·
 *     booked info 'จองแล้ว' · draft warning 'ร่าง' · pending warning 'รอดำเนินการ' · queued warning 'รอคิว' ·
 *     not_started warning 'ยังไม่เริ่ม' · unknown warning 'ไม่ทราบผล' · no_show warning 'ไม่มาตามนัด' · failed error 'ล้มเหลว' ·
 *     dead error 'ล้มเหลวถาวร' · inactive default 'ปิดใช้งาน' · deleted default 'ลบแล้ว' · cancelled default 'ยกเลิก' ·
 *     not_required default 'ไม่ต้องส่ง'
 */
export interface StatusChipProps {
  status: string;
  kind?: StatusChipKind;
  label?: string;
}
export declare function StatusChip(props: StatusChipProps): ReactNodeLike;

/** Card variant 'outlined'. title → CardHeader (title h6, actions right; below 'sm' actions wrap under the title). Children in CardContent. */
export interface SectionCardProps {
  title?: string;
  actions?: ReactNodeLike;
  children: ReactNodeLike;
}
export declare function SectionCard(props: SectionCardProps): ReactNodeLike;

/**
 * Mounted ONCE by core in main.tsx (inside ThemeProvider, around the router). Features never mount it.
 * One Snackbar + Alert at a time, FIFO queue; success/info auto-hide 3 s, error 6 s; close button; Alert role="alert".
 */
export interface ToastProviderProps {
  children: ReactNodeLike;
}
export declare function ToastProvider(props: ToastProviderProps): ReactNodeLike;

/**
 * @owner F01 core · C1 · web/src/core/ui/LanguageSwitch.tsx · consumers: AppShell TopBar, and EVERY page rendered
 * without the AppShell (login, F02 auth pages, F09 public Demo Chat, F14 public payment page).
 * Two-state button TH | EN (data-testid "lang-switch"): i18n.changeLanguage, stores the choice in localStorage
 * 'nless.lang', sets document.documentElement.lang. No page may be unable to switch language.
 */
export declare function LanguageSwitch(props: { compact?: boolean }): ReactNodeLike;
/**
 * Messages are already-translated strings. error(err): string → as is · ApiFailure (or WebApiError → its .failure) →
 * t(`common:errors.<code>`, { defaultValue: error.message }) + console.warn(code, requestId) · anything else →
 * t('common:errors.generic') ('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'). Outside a ToastProvider (feature unit tests) → no-op +
 * console.warn, never throws.
 */
export interface ToastApi {
  success(msg: string): void;
  error(err: string | ApiFailure | unknown): void;
  info(msg: string): void;
}
export declare function useToast(): ToastApi;

export interface ApiQueryOptions {
  /** Extra values that trigger a refetch when they change (path and the current business id already do). */
  deps?: unknown[];
}
export interface ApiQueryState<T> {
  data: T | undefined;
  error: ApiFailure | null;
  loading: boolean;
  reload: () => void;
}
/**
 * GET via the core api client, scoped to the current business: '/catalog/items' → api.get(api.biz('/catalog/items')) =
 * GET /api/v1/businesses/<current id>/catalog/items. T = ApiResult.data.
 * path null, or no current business yet → skip: no request, data undefined, loading false, error null.
 * Refetches when path, the current business id or opts.deps change; a late response of an older request is dropped.
 * reload() refetches and keeps the previous data while loading. error = the WebApiError's .failure (other throws →
 * synthesized INTERNAL failure). NOT toasted: the page renders it (e.g. EmptyState + retry Button).
 * Routes without :businessId (auth 'user', e.g. /me) → call api.get directly.
 */
export declare function useApiQuery<T>(path: string | null, opts?: ApiQueryOptions): ApiQueryState<T>;

export type ApiMutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface ApiMutationOptions {
  /** Default true: a failure calls useToast().error(failure) before run() rejects. */
  toastOnError?: boolean;
}
export interface ApiMutationState<I, O> {
  run: (input: I) => Promise<O>;
  running: boolean;
  error: ApiFailure | null;
}
/**
 * run(input): p = typeof path === 'function' ? path(input) : path → api.biz(p) → POST/PUT/PATCH send `input` as the JSON
 * body · DELETE sends no body (input only feeds the path function). running true while pending.
 * Success → error null, resolves O (ApiResult.data). Failure → error = failure, toast (unless toastOnError false), then
 * rejects with the same WebApiError so the caller stops (FormDialog / ConfirmDialog swallow it and stay open).
 * No success toast: the caller does toast.success(t('common:toast.saved')) ('บันทึกแล้ว').
 */
export declare function useApiMutation<I, O>(
  method: ApiMutationMethod,
  path: string | ((input: I) => string),
  opts?: ApiMutationOptions,
): ApiMutationState<I, O>;

/** Everything a feature page imports from web/src/core (index.ts), besides PageHeader / PlaceholderPage / RequirePermission / defineFeaturePages. */
export interface WebCore {
  api: WebApiClient;
  useSession(): SessionState;
  useCan(key: PermissionKey): boolean;
  /** Subscribe to realtime events of the current business. Returns nothing; unsubscribes on unmount. */
  useRealtime<T extends RealtimeEvent['type']>(type: T, handler: (event: Extract<RealtimeEvent, { type: T }>) => void): void;
  useSlot(slot: SlotName): SlotContribution[];
  /** Format integer minor units: formatMoney(149000) → '฿1,490'. */
  formatMoney(minor: number, currency?: 'THB'): string;
  /** ISO UTC → Asia/Bangkok display in the UI language. */
  formatDateTime(iso: string, opts?: { dateOnly?: boolean }): string;
  // ---- UI kit (web/src/core/ui/*), behaviour in the JSDoc above ----
  DataTable<T>(props: DataTableProps<T>): ReactNodeLike;
  FormDialog(props: FormDialogProps): ReactNodeLike;
  ConfirmDialog(props: ConfirmDialogProps): ReactNodeLike;
  EmptyState(props: EmptyStateProps): ReactNodeLike;
  StatusChip(props: StatusChipProps): ReactNodeLike;
  SectionCard(props: SectionCardProps): ReactNodeLike;
  ToastProvider(props: ToastProviderProps): ReactNodeLike;
  useToast(): ToastApi;
  useApiQuery<T>(path: string | null, opts?: ApiQueryOptions): ApiQueryState<T>;
  useApiMutation<I, O>(method: ApiMutationMethod, path: string | ((input: I) => string), opts?: ApiMutationOptions): ApiMutationState<I, O>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FEATURE CONTRACTS
// Types → shared/features/<slug>/types.ts · functions → server/src/features/<slug>/service.ts
// C1 writes the @fake body at setup. The owner swaps the body, keeps the signature.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ═══ target: shared/features/inbox/types.ts + server/src/features/inbox/service.ts — F09 inbox · A1 ═══

export interface ConversationRecord {
  id: string;
  businessId: string;
  customerId: string;
  customer: { displayName: string; externalId: string; channelAccountId: string | null };
  channel: Channel;
  status: 'open' | 'closed';
  handler: 'ai' | 'human';
  assigneeUserId: string | null;
  aiForceOn: boolean;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  version: number;
  createdAt: string;
}
export interface MessageRecord {
  id: string;
  businessId: string;
  conversationId: string;
  seq: number;
  direction: MessageDirection;
  author: MessageAuthor;
  authorUserId: string | null;
  parts: MessagePart[];
  /** Plain text of the parts (search, previews, model context). */
  text: string;
  channel: Channel;
  origin: MessageOrigin;
  externalId: string | null;
  groupId: string | null;
  delivery: { mode: DeliveryMode | null; state: DeliveryState; externalRef: string | null; error: string | null };
  createdAt: string;
}
export interface SaveMessageInput {
  businessId: string;
  /** Existing conversation. Omit it for a new inbound contact: give `customer` and core finds/creates customer + open conversation. */
  conversationId?: string;
  customer?: { channel: Channel; externalId: string; displayName?: string; channelAccountId?: string | null };
  direction: MessageDirection;
  author: MessageAuthor;
  authorUserId?: string | null;
  parts: MessagePart[];
  /** Provider message id. Unique per (business, channel): a replayed webhook returns the existing row, created:false. */
  externalId?: string | null;
  /** Default: 'live' (or 'demo' for channel 'web'). */
  origin?: MessageOrigin;
  /**
   * Default true only for direction 'inbound' + author 'customer' + origin 'live'|'demo'. Set false to store without
   * replying (e.g. F30 saves voice transcripts with triggerAi: false — the realtime model already answered).
   */
  triggerAi?: boolean;
  /** Same message from bubble splitting / rich rows shares one groupId. */
  groupId?: string | null;
  /** Provider extras kept on the row, e.g. { replyToken, replyTokenExpiresAt } (LINE), { windowExpiresAt } (Messenger / Instagram 24-hour window). */
  providerMeta?: Record<string, unknown>;
  /** Staff sends from the browser: same id twice → same row. */
  clientRequestId?: string | null;
  occurredAt?: string;
}
export interface SaveMessageResult {
  message: MessageRecord;
  conversation: ConversationRecord;
  /** false = dedup hit (externalId or clientRequestId seen before): nothing inserted, no AI job. */
  created: boolean;
  /** Job id of 'ai.reply' when one was enqueued, else null. */
  aiJobId: string | null;
}
export interface HistoryOptions {
  /** Default 30, max 100. Out of range / not an integer → VALIDATION_ERROR. */
  limit?: number;
  /** Cursor from a previous page: older messages. */
  before?: string | null;
  /** Cursor: newer messages (live refresh). Giving both before and after → VALIDATION_ERROR. */
  after?: string | null;
  businessId?: string;
}

/** Job type enqueued by saveMessage and handled by F10 (B2). */
export const AI_REPLY_JOB = 'ai.reply';
export interface AiReplyJobPayload extends Record<string, unknown> {
  conversationId: string;
  messageId: string;
}

/**
 * @owner F09 inbox · A1 · consumers: C2 (webhooks, comments), B2 (ai.reply, voice transcripts), A1 Demo Chat, core sendToCustomer, A2, A3
 * Persist one message. Finds/creates customer + open conversation when conversationId is omitted.
 * Assigns the next per-conversation seq atomically (conversations.next_seq). Updates last_message_at /
 * last_inbound_at / unread_count, publishes 'message.created'. When triggerAi resolves true it enqueues
 * jobs.enqueue(AI_REPLY_JOB, { conversationId, messageId }, { dedupKey: `ai.reply:${messageId}`,
 * businessId, lockKey: `conversation:${conversationId}` }). It does NOT check aiEnabled/takeover: the
 * ai.reply handler does (so inbound is always stored).
 * Errors: conversation of another business → NOT_FOUND; empty parts → VALIDATION_ERROR.
 * @fake C1 ships this REAL and minimal over the core tables (customers, conversations, messages). A1 extends
 *   it (attachments, unread rules, previews) without changing the signature.
 */
export declare function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult>;

/**
 * @owner F09 inbox · A1. Null when missing or (opts.businessId given) another tenant's (R3).
 * @fake real minimal SELECT over core conversations + customers.
 */
export declare function getConversation(conversationId: string, opts?: { businessId?: string }): Promise<ConversationRecord | null>;

/**
 * @owner F09 inbox · A1. The newest `limit` messages (or the page before/after a cursor), returned in ASCENDING
 * seq order (ready for model context and chat UI). nextCursor pages to older messages. Unknown conversation →
 * { items: [], nextCursor: null }.
 * @fake real minimal SELECT … ORDER BY seq DESC LIMIT n, reversed; cursor = base64url(seq); `after` = seq > cursor ASC.
 */
export declare function getHistory(conversationId: string, opts?: HistoryOptions): Promise<Page<MessageRecord>>;

// ---- F09 additions (v3): the staff send path, the Meta 24-hour window helper, chat uploads ----

export interface ChatAttachmentRef {
  fileId: string;
  kind: 'image' | 'file';
}
export interface ChatAttachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
}
/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (composer, template send), F09 routes
 * The only way staff send a message from the web. Checks the conversation belongs to the business; takeover rule:
 * handler 'ai' or no assignee → assignConversation(actorUserId) first (unless autoTakeover false); held by someone
 * else → VERSION_CONFLICT (details.holder). Builds the parts on the server (text + image/file whose ownership was
 * checked) or accepts `parts` already validated by F12 (text, image, file, product_card, action_buttons only), then
 * sendToCustomer(..., { author: 'staff', authorUserId, clientRequestId, businessId }). Closed conversation → POLICY_BLOCKED.
 * @fake real implementation from the start (it may call the F11 fake).
 */
export declare function sendStaffMessage(input: {
  businessId: string;
  conversationId: string;
  actorUserId: string;
  clientRequestId: string;
  text?: string;
  attachments?: ChatAttachmentRef[];
  parts?: MessagePart[];
  /** false = do not take the conversation over automatically. Default true. */
  autoTakeover?: boolean;
}): Promise<SendReceipt>;
/**
 * @owner F09 inbox · A1 · consumers: A1 F23 broadcast and B2 F38 follow-ups (Messenger/Instagram 24-hour window)
 * Latest last_inbound_at of this customer across all of the business's conversations (open or closed).
 * No conversation, or a customer of another business → null (R3).
 * @fake real: SELECT max(last_inbound_at) FROM conversations WHERE business_id = $1 AND customer_id = $2.
 */
export declare function getCustomerLastInboundAt(businessId: string, customerId: string): Promise<string | null>;
/**
 * @owner F09 inbox · A1 · consumers: every lane that sends a code-written text to a customer (A2 F13/F14, A3 F15,
 *   C2 F17/F18/F21 card labels and notices, B2 F38, C1 F39)
 * The language to use for a code-written message in this conversation: detectTextLanguage() of the customer's
 * messages, newest first, over at most the last 6 customer messages that have text; the first non-null result wins.
 * No such message → the business's `language` (BusinessSettings.language is a default, not a lock). Unknown
 * conversation, or another tenant's when opts.businessId is given → the language of opts.businessId's business, or 'th'.
 * Never throws. F10 does not call this: it decides per turn from the same detectTextLanguage (F10 spec §5.13).
 * @fake real minimal: SELECT text FROM messages WHERE conversation_id = $1 AND author = 'customer' ORDER BY seq DESC
 *   LIMIT 6, then detectTextLanguage; fallback businesses.language.
 */
export declare function getCustomerLanguage(conversationId: string, opts?: { businessId?: string }): Promise<CustomerLanguage>;
/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (template assets), F09 routes
 * Checks MIME type, size and file signature, then storage.save. Images go through model.moderate
 * (flagged → VALIDATION_ERROR details.reason 'moderation_flagged'; provider failure → accepted and logged).
 * @fake real implementation from the start.
 */
export declare function saveChatAttachment(input: {
  businessId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
  purpose?: 'chat-attachment' | 'template-asset';
}): Promise<ChatAttachment>;
/**
 * @owner F09 inbox · A1 · consumer: C1 F39 (MCP tool propose_order)
 * Creates the identity of a brand-new Demo Chat visitor for this business and returns a link that opens the public
 * Demo Chat as that visitor: the page reads `#v=<visitorToken>` from the URL fragment, verifies it through its session
 * route, stores the visitor cookie and removes the fragment. `customerExternalId` is `demo-visitor:<visitorId>`, so the
 * caller can saveMessage({ customer: { channel: 'web', externalId, displayName } }). Null when the business has no
 * enabled Demo Chat. The token can only read / write that one visitor's chat.
 * @fake { visitorId: uuid, customerExternalId, url: `${PUBLIC_BASE_URL}/demo-chat/s/<SEED slug>#v=fake-token`, publicSlug }
 *   for SEED shops, else null.
 */
export declare function getDemoChatHandoff(
  businessId: string,
): Promise<{ visitorId: string; customerExternalId: string; url: string; publicSlug: string } | null>;

// ═══ target: shared/features/team/types.ts + server/src/features/team/service.ts — F11 team · A1 ═══

export interface AssignmentResult {
  conversationId: string;
  assigneeUserId: string | null;
  handler: 'ai' | 'human';
  version: number;
}
/**
 * @owner F11 team · A1 · consumers: B2 ai.reply handler (must stay silent when true), C2 (channels, comments)
 * True when a human holds the conversation (conversations.handler = 'human'). Unknown id → false.
 * @fake real: SELECT handler = 'human' FROM conversations.
 */
export declare function isHumanTakeover(conversationId: string): Promise<boolean>;

/**
 * @owner F11 team · A1. userId → takeover by that member (handler 'human'); null → hand back to AI (handler 'ai').
 * opts.expectedVersion mismatch → VERSION_CONFLICT (409). Assignee not a member of the business → VALIDATION_ERROR.
 * Bumps version, publishes 'conversation.updated', writes audit 'conversation.assign'.
 * @fake real minimal UPDATE on core conversations (+ version check, publish). F11 adds schedules, notes, idle rules.
 */
export declare function assignConversation(
  conversationId: string,
  userId: string | null,
  opts?: { expectedVersion?: number; actorUserId?: string; businessId?: string },
): Promise<AssignmentResult>;

// ---- F11 additions (v3): AI-initiated handoff, close / reopen, availability ----

/**
 * @owner F11 team · A1 · consumers: B2 F10 (escalation, PROVIDER_BUDGET_EXHAUSTED), B2 F30 voice (customer asks for a person)
 * Puts the conversation into human handling WITHOUT an assignee: handler 'human', assignee null → isHumanTakeover()
 * is true, the bot goes silent, the conversation shows in the "waiting for staff" queue; writes an audit note, publishes
 * 'conversation.updated', audits 'conversation.handoff.requested', calls
 * notify({ type: 'chat.handoff', to: { permission: 'chat.takeover' }, link: '/chat?c=<id>' }) and, when the team's
 * auto-assign setting is on, assigns an available staff member round-robin. Idempotent: already 'human' → returns the
 * current state, no version bump, no second notification. Closed conversation → POLICY_BLOCKED. Unknown id or another
 * business → NOT_FOUND. `reason` is free text for the note (F10 sends customer_request | cannot_answer | complaint |
 * payment_issue | budget_exhausted | ai_failed | other). F10 does NOT call notify() itself when this call succeeds.
 * @fake flips an in-memory flag so isHumanTakeover(conversationId) returns true; returns
 *   { conversationId, assigneeUserId: null, handler: 'human', version: 1 }.
 */
export declare function requestHumanHandoff(
  conversationId: string,
  input: { reason: string; actor: 'ai' | 'customer' | 'staff' },
  opts?: { businessId?: string },
): Promise<AssignmentResult>;
/**
 * @owner F11 team · A1 · consumers: A1 F09 (Demo Chat reset), F11 idle timers
 * Closes the conversation (status 'closed', closed_at, version + 1, publish 'conversation.updated', audit
 * 'conversation.close'). Never a 409; closing twice is a no-op.
 */
export declare function closeConversation(
  conversationId: string,
  opts: { actorUserId: string | null; reason?: string; businessId?: string },
): Promise<{ status: 'closed'; version: number }>;
/**
 * @owner F11 team · A1. Reopens the customer's most recently closed conversation when the customer has no open one,
 * otherwise POLICY_BLOCKED (details.reason 'customer_has_open_conversation').
 */
export declare function reopenConversation(
  conversationId: string,
  opts: { actorUserId: string; businessId?: string },
): Promise<{ status: 'open'; version: number }>;
/**
 * @owner F11 team · A1 · consumer: B3 F27 (staff available now)
 * The availability in effect at `at` (default now) of every member of the business who holds chat.takeover.
 * @fake []
 */
export declare function getTeamAvailability(
  businessId: string,
  at?: string,
): Promise<{ userId: string; displayName: string; availability: 'available' | 'away' | 'off_shift' }[]>;

// ═══ target: shared/features/message-templates/types.ts + server/src/features/message-templates/service.ts — F12 · A1 ═══

/** Values for `{{name}}` placeholders. Unknown placeholders render as empty string. Values are plain text, never HTML. */
export type TemplateVars = Record<string, string | number>;
/**
 * @owner F12 message-templates · A1 · consumers: A1 broadcast, C2 comments, A2 orders, B2
 * Renders a saved template to MessagePart[]. Missing template, or opts.businessId given and the template
 * belongs to another business → NOT_FOUND (it is a mutation input, so it throws).
 * @fake SEED.templates by id: one TextPart with `{{key}}` replaced from vars.
 */
export declare function renderTemplate(templateId: string, vars: TemplateVars, opts?: { businessId?: string }): Promise<MessagePart[]>;

// ═══ target: shared/features/ai-agent/types.ts + server/src/features/ai-agent/service.ts — F10 ai-agent · B2 ═══

export interface GenerateReplyOptions {
  /** 'reply' (default) = answer the customer · 'suggest' = staff draft (F12), never sent automatically. */
  mode?: 'reply' | 'suggest';
  /** The inbound message this turn answers (dedup: same message → same turn, no second model call). */
  triggerMessageId?: string;
  signal?: AbortSignal;
}
/**
 * @owner F10 ai-agent · B2 · consumers: B2 ai.reply handler, A1 (suggest), B2 voice
 * Reads getHistory, getBusinessSettings, searchKnowledge, getProduct/getPrice; calls model.chat model 'chat' with
 * bounded tools (max 4 tool calls per turn incl. parallel, loop via providerState, MODEL_TIMEOUT_MS); classifier /
 * extraction use model 'fast' + strict json_schema; at most one retry of the turn with model 'strong'.
 * Prices/stock only from getPrice/getProduct. Card numbers in customer text are masked before any model call or trace.
 * Answer first, then offer staff (handoff-offer) instead of handing off on the first unclear message.
 * LANGUAGE: the reply is in the language of the customer's latest message, Thai or English, decided per message
 * (docs/specs/F10-ai-agent.md §5.13). BusinessSettings.language is only the default for a message with no letters.
 * Every text written by code (fallbacks, handoff notice, receipt, card altText, formatted amounts) follows the same language.
 * Does NOT save or send (delivery { mode: 'real', state: 'not_required' }). Writes its own turn trace (F10 table).
 * Model timeout/error → returns state 'failed' with reply.parts [] (nothing is saved for that attempt).
 * PROVIDER_BUDGET_EXHAUSTED (team credits / hard limit gone) → state 'handoff' with the fixed handoff text of
 * fake step 4 in the customer's language (no model text), so staff take over. It does not throw for model/provider
 * errors and never causes a side effect. Unknown conversation → AppError('NOT_FOUND').
 * @fake deterministic, no model call, Thai reply (the fake is not bilingual; the 13:00 gate needs the real one):
 *   1. last customer message text = q (from getHistory); business from getConversation.
 *   2. a SEED.catalog item of that business whose sku or name/nameEn appears in q (case-insensitive) →
 *      getPrice → "<name> (<sku>) ราคา <฿x,xxx> ค่ะ" (+ " ตอนนี้สินค้าหมดค่ะ" when soldOut);
 *      evidenceIds [`catalog:<itemId>:v<version>`].
 *   3. else searchKnowledge(businessId, q) top hit → "จากข้อมูลร้าน: <snippet>" ; evidenceIds [`knowledge:<id>:r<revision>`].
 *   4. else "ขออภัยค่ะ ยังไม่มีข้อมูลเรื่องนี้ เดี๋ยวให้พนักงานช่วยตอบนะคะ", state 'handoff', evidenceIds [].
 *   turnId = `fake-turn-<triggerMessageId ?? conversationId>`; delivery { mode: 'real', state: 'not_required' }.
 */
export declare function generateReply(conversationId: string, opts?: GenerateReplyOptions): Promise<ChatTurnResult>;

/**
 * ai.reply job handler (F10 owns it, declared in features/ai-agent/routes.ts `jobs`). Order is fixed:
 *   1 getBusinessSettings(businessId).aiEnabled  2 isHumanTakeover(conversationId) false
 *   3 serialisation: the job's lockKey `conversation:<id>` already guarantees one ai.reply per conversation (the worker
 *     holds that advisory lock for the whole job). The handler must NOT take `conversation:<id>` again from another
 *     connection (it would wait on itself); when it needs its own lock it uses db.withAdvisoryLock(`ai.turn:<id>`).
 *     Turn claim/dedup = unique row in the F10 `ai_turns` table per inbound message.
 *   4 generateReply(conversationId, { triggerMessageId }) — state 'failed' or empty parts → stop (nothing saved) and
 *     retry the job (at most 3 attempts). After the last attempt, or on a non-retryable provider error, the customer is
 *     not left in silence: the handler sends one fixed apology in the customer's language and calls
 *     requestHumanHandoff(reason 'ai_failed') (F10 spec §5.9). The apology is code text, never a model answer.
 *   5 re-check 1+2 (state may have changed during the model call)
 *   6 saveMessage({ direction: 'outbound', author: 'ai', parts, origin, groupId }) → messageId (one groupId per reply)
 *   7 sendToCustomer(conversationId, parts, { messageId }).
 *   Any "no" in 1–2/5 → return quietly (message stays stored, no reply, no error). No plan or quota check: unlimited
 *   (core model.* already wrote the cost rows to model_usage).
 * @fake C1 ships exactly this handler using the fakes, so the loop works at SETUP READY.
 */
export declare const aiReplyJobHandler: JobHandler<AiReplyJobPayload>;

/**
 * @owner F10 ai-agent · B2 · consumer: B3 F27 (seller impact + AI quality cards)
 * Counts and median over ai_turns with mode 'reply' and started_at in [range.from, range.to) (UTC, half-open).
 * turns = all rows · completed / awaitingConfirmation / handoff / failed / skipped = rows by state ('superseded'
 * counts as skipped) · medianLatencyMs = median of latency_ms over rows with state completed | awaiting_confirmation |
 * handoff, null when none.
 * @fake zeros everywhere, medianLatencyMs null (no table yet).
 */
export interface AiTurnMetrics {
  turns: number;
  completed: number;
  awaitingConfirmation: number;
  handoff: number;
  failed: number;
  skipped: number;
  medianLatencyMs: number | null;
}
export declare function getAiTurnMetrics(businessId: string, range: MetricsRange): Promise<AiTurnMetrics>;

/**
 * @owner F10 ai-agent · B2 · consumer: F38 follow-ups (same lane, still imported only from service.ts)
 * Persisted reply turns (mode 'reply', state completed | awaiting_confirmation, reply saved) whose finished_at is in
 * [finishedFrom, finishedTo), oldest first, limit default 100 max 500. productRefs = products the turn used
 * (get_price, list_products shown, propose_order); may be []. customerId comes from the conversation row.
 * @fake []
 */
export interface AiTurnTopic {
  turnId: string;
  businessId: string;
  conversationId: string;
  customerId: string;
  inboundMessageId: string;
  inboundCreatedAt: string;
  intent: string | null;
  productRefs: { itemId: string; sku: string; name: string }[];
  replyMessageId: string | null;
  finishedAt: string;
}
export declare function listAiTurnTopics(businessId: string, opts: { finishedFrom: string; finishedTo: string; limit?: number }): Promise<AiTurnTopic[]>;

// ═══ target: shared/features/follow-ups/types.ts + server/src/features/follow-ups/service.ts — F38 follow-ups · B2 ═══

/**
 * @owner F38 follow-ups · B2 · consumer: B3 F27 (seller impact metrics: "recovered follow-ups")
 * Cohort = follow_ups rows with is_test = false and created_at in [range.from, range.to) (UTC, half-open).
 * scheduled = rows in the cohort · sent = state 'sent' · cancelled = state 'cancelled' or 'failed' (never delivered) ·
 * recovered = sent rows where the customer sent a message or an order was created within 24 h after sent_at.
 * recovered <= sent <= scheduled.
 * @fake all zeros.
 */
export interface FollowUpMetrics {
  scheduled: number;
  sent: number;
  cancelled: number;
  recovered: number;
}
export declare function getFollowUpMetrics(businessId: string, range: MetricsRange): Promise<FollowUpMetrics>;

// ═══ target: shared/features/knowledge/types.ts + server/src/features/knowledge/service.ts — F05 knowledge · B1 ═══

export interface KnowledgeDraftInput {
  businessId: string;
  kind?: 'faq' | 'article';
  /** ≤ 255 chars (longer → VALIDATION_ERROR). */
  title: string;
  /** ≤ 20,000 chars. */
  body: string;
  folderId?: string | null;
  /** Import job id (F06) kept on the row for traceability. */
  sourceRef: string;
  /** Same (businessId, clientRequestId) twice → the existing item, created: false. Use `<importId>:<rowNo>`. */
  clientRequestId: string;
  /** null = system. */
  actorUserId: string | null;
}
export interface KnowledgeDraftResult {
  itemId: string;
  revision: number;
  created: boolean;
  warnings: { code: 'duplicate_title' | 'duplicate_content'; itemId: string }[];
}
/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06 knowledge-import)
 * Writes ONE knowledge item as status 'draft' (source 'import'); never active, never indexed (the shop reviews and
 * submits it in /knowledge). Moderation runs at submit, not here. Empty title AND body → VALIDATION_ERROR.
 * Audit knowledge.item.create. Idempotent by clientRequestId. Does not publish realtime events.
 * @fake inserts nothing: returns { itemId: `fake-draft-<clientRequestId>`, revision: 1, created: true, warnings: [] }.
 */
export declare function createKnowledgeDraft(input: KnowledgeDraftInput): Promise<KnowledgeDraftResult>;

/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06)
 * Finds a folder by name (trimmed, case-insensitive) or creates it. Name rules as the folder routes
 * (1–100 chars, one line) else VALIDATION_ERROR.
 * @fake { id: `fake-folder-<lowercased name>`, name, created: true }.
 */
export declare function ensureKnowledgeFolder(
  businessId: string, name: string, actorUserId: string | null,
): Promise<{ id: string; name: string; created: boolean }>;

// ═══ target: shared/features/knowledge-search/types.ts + server/src/features/knowledge-search/service.ts — F07 · B1 ═══

export interface KnowledgeHit {
  knowledgeItemId: string;
  revision: number;
  title: string;
  /** ≤ 400 chars of the matched chunk. Data for the model, not instructions. */
  snippet: string;
  /** 0..1, higher is better. Not a correctness guarantee. */
  score: number;
  folderId: string | null;
}
export interface KnowledgeSearchResult {
  query: string;
  strategy: 'lexical' | 'vector' | 'hybrid';
  hits: KnowledgeHit[];
  mode: 'real' | 'fake';
}
export interface SearchKnowledgeOptions {
  /** Default 5, max 20. */
  topK?: number;
  /**
   * Default 0.1 (fake/lexical). B1 re-tunes it on the SPEC §5 fixtures for text-embedding-3-large @ 1536
   * (do not copy Papi's thresholds: they were tuned for other embedding models).
   */
  minScore?: number;
  folderIds?: string[];
}
/**
 * @owner F07 knowledge-search · B1 · consumers: B2 (ai-agent, voice)
 * Only items with status 'active' AND index state 'ready' of THIS business. Draft / inactive / deleted /
 * not-ready never appear. Another tenant's marker (e.g. TENANT_B_ONLY_OWL_482 searched from A) → no hits.
 * Real: model.embed({ purpose: 'query' }) + pgvector cosine over chunks embedded with the same model; optional
 * rerank = top 20 → model 'fast' strict schema { ids_ranked } (ids limited to the ones sent; failure → cosine order).
 * @fake SEED.knowledge filtered by business + active + ready. Score = |T(q) ∩ T(doc)| / |T(q)| where T = the
 *   token set of ModelApi.embed's fake tokenizer (Latin words + Thai bigrams) over title + body. Keep score ≥
 *   minScore, sort desc, take topK; snippet = first 400 chars of body; strategy 'lexical'; mode 'fake'.
 */
export declare function searchKnowledge(businessId: string, query: string, opts?: SearchKnowledgeOptions): Promise<KnowledgeSearchResult>;

// ═══ target: shared/features/catalog/types.ts + server/src/features/catalog/service.ts — F08 catalog · B1 ═══

export interface CatalogVariant {
  id: string;
  name: string;
  sku: string | null;
  /** null = same as item price. */
  priceMinor: number | null;
  stock: number | null;
}
export interface CatalogItem {
  id: string;
  businessId: string;
  sku: string;
  kind: 'product' | 'service';
  name: string;
  nameEn: string | null;
  priceMinor: number;
  currency: 'THB';
  /** null = not stock-tracked (services). */
  stock: number | null;
  shippable: boolean;
  durationMinutes: number | null;
  active: boolean;
  variants: CatalogVariant[];
  version: number;
}
/** Lookup by id, by SKU (exact, case-insensitive) or by name (exact match first, else the single item whose name/nameEn contains it; ambiguous → null). */
export type ProductRef = { itemId: string } | { sku: string } | { name: string };
export interface PriceQuote {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  currency: 'THB';
  available: number | null;
  soldOut: boolean;
  /** Catalog version the price came from; a proposal stores it and re-checks on confirm. */
  version: number;
}
/**
 * @owner F08 catalog · B1 · consumers: B2 (tools, cards), A2 (orders, live codes)
 * Null when not found / inactive / other business (R3).
 * @fake SEED.catalog of that business.
 */
export declare function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null>;

/**
 * @owner F08 catalog · B1. Canonical price from the DB now. quantity default 1, must be a positive integer
 * → else VALIDATION_ERROR. Unknown item/variant → NOT_FOUND. Sold out (stock 0 or < quantity) → soldOut: true
 * (R4, not a throw). subtotalMinor = unit × quantity, integer math. Shipping is NOT included (F13 adds it).
 * @fake SEED.catalog: A-GAME-01 ×2 → subtotal 298000; A-SOLD-01 → soldOut true; services → available null.
 */
export declare function getPrice(
  businessId: string,
  input: ProductRef & { variantId?: string | null; quantity?: number },
): Promise<PriceQuote>;

// ---- additions (v3) from docs/specs/F08-catalog.md ----
/** @owner F08 catalog · B1 · MANDATORY (agreed with B2 F10 list_products, C1 F39 ACP feed + MCP search_catalog, A2 F22)
 *  Customer-facing listing: ONLY active, not-deleted items of THIS business (never inactive, never another tenant).
 *  query   = every whitespace-separated word must match (case-insensitive, NFKC) name, nameEn, an item/variant SKU or category (substring).
 *  category = exact (case-insensitive) match. maxPriceMinor = item price <= max OR any active variant price <= max.
 *  inStockOnly = stock is null OR stock > 0 (services always pass). limit default 20, max 100 (> 100 → 100; < 1 or not an integer → VALIDATION_ERROR).
 *  Sorted by name (case-insensitive) then id. cursor is opaque (from a previous nextCursor); a malformed cursor → VALIDATION_ERROR.
 *  Items carry active variants only. No price visibility policy here: callers (F10) hide prices per answerPolicy.
 *  @fake filters SEED.catalog of that business by name / nameEn / sku substring, maxPriceMinor, inStockOnly (stock === null || stock > 0);
 *        category is ignored (SEED has none); sorted by name; cursor = String(offset); limit as above. */
export declare function listCatalogItems(
  businessId: string,
  opts?: { query?: string; category?: string; maxPriceMinor?: number; inStockOnly?: boolean; limit?: number; cursor?: string },
): Promise<Page<CatalogItem>>;

/** Extra fields for feeds, cards and pricing pages. CatalogItem stays the lean contract type. */
export interface CatalogItemDetail extends CatalogItem {
  description: string | null;
  category: string | null;
  /** Sale unit label, e.g. 'ชิ้น', 'ชุด', 'ครั้ง'. */
  unit: string;
  /** In display order (first = primary). fileId = core `files.id`; the public URL is the consumer's job (F39 builds it from PUBLIC_BASE_URL). */
  images: { fileId: string; alt: string }[];
  variants: (CatalogVariant & { effectivePriceMinor: number; effectiveStock: number | null })[];
}
/** @owner F08 catalog · B1 · consumers: C1 F39 (feed), A2 F22
 *  Active items only, unknown / other-tenant / inactive ids silently skipped. ≤ 100 ids (more → VALIDATION_ERROR). Order = input order.
 *  @fake SEED.catalog rows by id, description null, category null, unit 'ชิ้น', images []. */
export declare function getCatalogItemDetails(businessId: string, itemIds: string[]): Promise<CatalogItemDetail[]>;

/** @owner F08 catalog · B1 · consumer: A2 F13 (decrement on order confirm, give back on cancel). OPTIONAL for A2: if never called, stock stays manual.
 *  One atomic UPDATE (stock = stock + delta, never below 0): result below 0 → AppError('SOLD_OUT'); stock null (not tracked) → no-op returning
 *  { stockAfter: null, applied: false }. variantId given → that variant's stock (variant stock null → falls back to the item stock).
 *  Bumps catalog_items.version (so open proposals re-check). Idempotent per (refType, refId, itemId, variantId): a repeat returns the first result with applied:false.
 *  Audit catalog.stock.adjust. Unknown / inactive-is-allowed (a cancelled order may return stock to an inactive item) / other tenant → NOT_FOUND.
 *  @fake { stockAfter: null, applied: false, version: 1 }. */
export declare function adjustCatalogStock(input: {
  businessId: string; itemId: string; variantId?: string | null; delta: number;
  reason: 'order' | 'order_cancel' | 'correction'; refType: string; refId: string; actorUserId: string | null;
}): Promise<{ stockAfter: number | null; applied: boolean; version: number }>;

/** Draft rows from a CSV / sheet. Price is already integer satang (use parsePriceToMinor on text). */
export interface CatalogImportRow {
  rowNo: number;
  sku: string;
  kind?: 'product' | 'service';
  name: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  priceMinor: number;
  unit?: string;
  stock?: number | null;
  shippable?: boolean;
  durationMinutes?: number | null;
  variants?: { name: string; sku?: string | null; priceMinor?: number | null; stock?: number | null }[];
}
export interface CatalogImportError { rowNo: number; sku: string | null; code: 'sku_invalid' | 'sku_taken' | 'sku_duplicate_in_file' | 'name_required' | 'price_invalid' | 'stock_invalid' | 'duration_required' | 'variant_invalid' | 'variant_limit' | 'sku_exists'; message: string }
export interface CatalogImportResult {
  applied: boolean;                     // false when dryRun, or onError 'abort' with errors
  created: number; updated: number; skipped: number;
  errors: CatalogImportError[];
  items: { rowNo: number; sku: string; itemId: string | null; action: 'created' | 'updated' | 'skipped' | 'error' }[];
}
/** @owner F08 catalog · B1 · consumer: B3 (F06 knowledge-import). Max 500 rows (more → VALIDATION_ERROR).
 *  New SKUs are created as DRAFTS: active = false, source 'import', sourceRef = importId — the shop reviews them in /catalog and turns them on.
 *  Existing SKU: mode 'create_only' (default) → skipped with error code 'sku_exists'; mode 'update_existing' → price / name / stock / unit / nameEn /
 *  description / category / shippable are updated in place (active flag untouched), version bumped, audit catalog.item.update + catalog.price.change.
 *  Validation is the same as POST /items. dryRun: validate and report only, writes nothing. onError 'abort' (default) = all or nothing;
 *  'skip_row' = apply valid rows, report the rest. One transaction. Audit catalog.import (counts only).
 *  @fake validates nothing, writes nothing: { applied: !dryRun, created: rows.length, updated: 0, skipped: 0, errors: [], items: fake ids }. */
export declare function importCatalogItems(input: {
  businessId: string; actorUserId: string | null; importId: string; rows: CatalogImportRow[];
  mode?: 'create_only' | 'update_existing'; onError?: 'abort' | 'skip_row'; dryRun?: boolean;
}): Promise<CatalogImportResult>;

/** Shared pure helper (shared/features/catalog/money.ts) for CSV / sheet text. Accepts Thai or Arabic digits, "฿", "บาท", "THB", spaces,
 *  thousands commas and at most 2 decimals: '1,490' → 149000 · '฿1,490.50' → 149050 · '๑๔๙๐ บาท' → 149000 · '12.5' → 1250.
 *  Returns null for empty, negative, > 100,000,000 baht, 3+ decimals, or anything else. A number input is treated as BAHT and must have ≤ 2 decimals. */
export declare function parsePriceToMinor(input: string | number): number | null;

// ═══ target: shared/features/business-settings/types.ts + server/src/features/business-settings/service.ts — F04 · C3 ═══

/**
 * Merchant answer policy (Papi custom_configuration.answer_policy). null = fully permissive.
 * Final behavior = capability ∩ policy, deny wins.
 */
export interface AnswerPolicy {
  price?: { reveal: 'always' | 'never' | 'ask_staff' };
  stock?: { reveal: 'always' | 'never' | 'ask_staff' };
  contact?: { reveal: 'always' | 'never' };
  /** false = answer only from the business's knowledge/catalog, no general world knowledge. */
  generalKnowledge?: boolean;
  booking?: { enabled: boolean };
}
export interface BusinessSettings {
  businessId: string;
  aiEnabled: boolean;
  timezone: string;
  hours: WeeklyHours;
  answerPolicy: AnswerPolicy | null;
  language: 'th' | 'en';
  version: number;
}
/**
 * @owner F04 business-settings · C3 · consumers: B2 (ai.reply gate, policy), C2, A3 (hours), B1
 * Never null for an existing business (defaults when no row). Unknown business → NOT_FOUND.
 * @fake SEED.businesses[].settings + timezone, answerPolicy null, version 1. Both seed businesses aiEnabled true.
 */
export declare function getBusinessSettings(businessId: string): Promise<BusinessSettings>;

// ---- F04 additions (v3): capability ∩ policy, open state, profile ----

export interface BusinessProfile {
  name: string;
  description: string;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
}
/** A closure period in the business's local dates ('YYYY-MM-DD', inclusive). */
export interface BusinessClosure {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}
export interface MerchantCapabilities {
  /** false = the shop never reveals prices to customers. */
  canQuotePrices: boolean;
  /** Orders through chat (AI tool propose_order). */
  canTakeOrders: boolean;
  /** Bookings through chat (find_slots / propose_booking). */
  canTakeBookings: boolean;
  /** Handoff to staff (handoff_to_staff). */
  canHandoffToHuman: boolean;
  /** The shop's phone / e-mail may be revealed. */
  canShareContact: boolean;
}
/** capability ∩ answerPolicy, deny wins. F10 decides tools and prompt directives from this, not from answerPolicy alone. */
export interface EffectiveAnswerRules {
  price: 'always' | 'never' | 'ask_staff';
  stock: 'always' | 'never' | 'ask_staff';
  contact: 'always' | 'never';
  generalKnowledge: boolean;
  booking: boolean;
  orders: boolean;
  handoff: boolean;
}
export interface BusinessOpenState {
  open: boolean;
  reason: 'open' | 'outside_hours' | 'closed_day' | 'closure';
  /** 'YYYY-MM-DD' and 'HH:mm' in the business timezone. */
  localDate: string;
  localTime: string;
  timezone: string;
  /** ISO UTC; null = no opening time in the next 31 days. */
  nextOpenAt: string | null;
  /** Set when reason is 'closure'. */
  closure: BusinessClosure | null;
}
/**
 * @owner F04 business-settings · C3 · consumers: C3 F03 tenancy (onboarding, right after a business is created), seeds
 * Creates the business_settings row (+ profile row) with DEFAULTS when missing; idempotent. Unknown business → NOT_FOUND.
 * @fake getBusinessSettings(businessId) (SEED values, no write).
 */
export declare function ensureBusinessSettings(businessId: string): Promise<BusinessSettings>;
/**
 * @owner F04 business-settings · C3 · consumers: B2 F10 (tool gating + directives), A3 F15 (booking enabled)
 * capability ∩ answerPolicy, deny wins. Never null. Unknown business → NOT_FOUND.
 * @fake all permissive: price / stock / contact 'always', generalKnowledge, booking, orders, handoff true.
 */
export declare function getEffectiveAnswerRules(businessId: string): Promise<EffectiveAnswerRules>;
/**
 * @owner F04 business-settings · C3 · consumers: B2 F10 (optional "closed today" hint), A3 F15/F16, C2
 * Open or closed at `at` (default now) in the business timezone, from weekly hours + closures. Unknown business → NOT_FOUND.
 * @fake { open: true, reason: 'open', timezone: 'Asia/Bangkok', nextOpenAt: null, closure: null, localDate / localTime from `at` }.
 */
export declare function getBusinessOpenState(businessId: string, at?: string): Promise<BusinessOpenState>;
/**
 * @owner F04 business-settings · C3 · consumer: B2 F10 (only when rules.contact === 'always'). Unknown business → NOT_FOUND.
 * @fake { name from SEED.businesses, description: '', contactPhone: null, contactEmail: null, address: null }.
 */
export declare function getBusinessProfile(businessId: string): Promise<BusinessProfile>;
/** @owner F04 business-settings · C3. Stored capabilities with defaults filled. Unknown business → NOT_FOUND. @fake all five true. */
export declare function getCapabilities(businessId: string): Promise<MerchantCapabilities>;

// ═══ target: shared/features/orders/types.ts + server/src/features/orders/service.ts — F13 orders · A2 ═══

export interface OrderSummary {
  id: string;
  businessId: string;
  conversationId: string | null;
  status: 'awaiting_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  paymentState: 'unpaid' | 'pending_verification' | 'paid' | 'refunded';
  lines: ReviewLine[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: 'THB';
  version: number;
  createdAt: string;
}
export type CreateOrderFromProposalInput =
  | {
      /** AI tool / staff: build an immutable quote from canonical prices. No order yet. */
      stage: 'propose';
      businessId: string;
      conversationId: string;
      items: { ref: ProductRef; variantId?: string | null; quantity: number }[];
      deliveryMethod: 'shipping' | 'pickup';
      clientRequestId: string;
    }
  | ({
      /** The customer's consent action (button/postback/web confirm). NEVER triggered by model text. */
      stage: 'confirm';
      businessId: string;
      conversationId: string;
      actor: { kind: 'customer' | 'staff'; userId?: string | null };
    } & ConfirmRequest);
export type CreateOrderFromProposalResult =
  | { stage: 'propose'; state: 'awaiting_confirmation'; proposal: ProposalSummary; review: OrderReviewPart }
  | { stage: 'confirm'; receiptId: string; replayed: boolean; order: OrderSummary | null; decision: 'confirm' | 'cancel' };
/**
 * @owner F13 orders · A2 · consumers: B2 (AI tool: stage 'propose' only), A1/C2 postback → stage 'confirm'
 * propose: prices via getPrice, shipping via SEED/business rule, sold out → SOLD_OUT, qty ≤ 0 → VALIDATION_ERROR.
 * confirm: same clientRequestId + same payload → same receipt (replayed true); same id + other payload →
 * IDEMPOTENCY_CONFLICT; price/stock changed since the quote → VERSION_CONFLICT; expired → PROPOSAL_EXPIRED.
 * Order row + receipt + outbox in one transaction. decision 'cancel' → order null.
 * @fake propose: computed from SEED (prices + SPEC shipping rule), NOT persisted, proposal.id =
 *   `fake-proposal-<clientRequestId>`, version 1, expiresAt now+15min, reviewToken `fake-review-<clientRequestId>`.
 *   confirm: throws AppError('SERVICE_NOT_READY', 'F13 orders not merged yet') (R8).
 */
export declare function createOrderFromProposal(input: CreateOrderFromProposalInput): Promise<CreateOrderFromProposalResult>;

// ---- additions (v3) from docs/specs/F13-orders.md ----
export interface OrderMetrics {
  /** Orders created (confirmed by the customer) with created_at in [from, to). */
  ordersCreated: number;
  /** Of those, orders whose proposal came from the AI tool (origin 'ai'): "orders the AI proposed and the customer confirmed". */
  ordersFromChat: number;
  /** Orders with paid_at in [from, to) whose payment_state is still 'paid' (refunded excluded). */
  ordersPaid: number;
  /** Sum of total_minor of those paid orders, in satang. */
  revenueMinor: number;
}
/**
 * @owner F13 orders · A2 · consumer: B3 F27 (seller impact metrics)
 * Half-open UTC range [range.from, range.to). Cancelled orders count in ordersCreated but never in ordersPaid / revenueMinor
 * unless they were paid and are still payment_state 'paid' (cancelled-and-refunded are excluded). ordersFromChat <= ordersCreated.
 * Invalid range (from >= to, not ISO) → VALIDATION_ERROR. Tenant-scoped by businessId.
 * @fake all zeros: { ordersCreated: 0, ordersFromChat: 0, ordersPaid: 0, revenueMinor: 0 }.
 */
export declare function getOrderMetrics(businessId: string, range: MetricsRange): Promise<OrderMetrics>;

/**
 * @owner F13 orders · A2 · consumers: B2 F38 follow-ups (did the customer order?), B2 F10
 * Newest first. opts.since = created_at >= since (ISO UTC). limit default 20, max 100 (more → 100; < 1 or not an integer →
 * VALIDATION_ERROR). Returns every status including 'cancelled' (callers filter). Another business's customer → [].
 * @fake [] (no orders).
 */
export declare function listOrdersByCustomer(
  businessId: string,
  customerId: string,
  opts?: { since?: string; limit?: number },
): Promise<OrderSummary[]>;

// ═══ target: shared/features/payments/types.ts + server/src/features/payments/service.ts — F14 payments · A2 ═══

export type SlipVerdict = 'verified' | 'wrong_amount' | 'wrong_account' | 'wrong_date' | 'duplicate' | 'unreadable' | 'suspected_forgery' | 'technical';
export interface SlipAnalysisInput {
  businessId: string;
  /** core `files.id` of the slip image (read with storage.read({ businessId }); another business's file → NOT_FOUND). */
  fileId: string;
  expected: {
    amountMinor: number;
    /** Full PromptPay id (mobile / national id / e-wallet) the money should go to; null = skip the digit comparison (name only → never auto-accept). */
    receiverPromptPayId: string | null;
    receiverName: string | null;
    /** ISO UTC. null = no bound. A transfer time outside [notBefore, notAfter] → 'wrong_date'. */
    notBefore: string | null;
    notAfter: string | null;
  };
  /** true = do not record the transaction ref, no audit, no usage of the order tables (evals / preview). Duplicate detection still READS recorded refs. */
  dryRun?: boolean;
  /** Only honoured when SLIP_VERIFY_MODE=sandbox: the labelled simulator outcome. Default 'unreadable'. */
  sandboxOutcome?: SlipVerdict | 'timeout';
}
export interface SlipAnalysis {
  verdict: SlipVerdict;
  /** 'vision' = QR decode + code checks + OpenAI vision read · 'sandbox' = labelled simulator (SLIP_VERIFY_MODE=sandbox). Never "bank verified". */
  mode: 'vision' | 'sandbox';
  /** 0..1, the vision model's legibility score (0 when no vision read happened). */
  confidence: number;
  amountMinor: number | null;
  /** ISO UTC. */
  transferredAt: string | null;
  transactionRef: string | null;
  receiverName: string | null;
  receiverLast4: string | null;
  qr: { found: boolean; sendingBank: string | null; transactionRef: string | null };
  checks: { name: string; pass: boolean; detail: string }[];
  /** verdict 'verified' AND a bank slip QR was decoded AND confidence >= 0.85 AND the receiver matched by digits AND no tamper flag. Anything less = a human must accept. */
  autoAcceptable: boolean;
  needsStaffReason: string | null;
}
/**
 * @owner F14 payments · A2 · consumers: B1 F37 evals (dryRun: true), F14 routes
 * Slip check pipeline (docs/specs/F14 §5.4): decode the mini QR printed on Thai bank slips (jsqr on sharp RGBA, full image then crops
 * / upscales), parse its TLV (sending bank + transaction reference), read amount / time / receiver / reference with
 * model.chat vision (alias 'chat', detail 'high', strict JSON schema), then decide ONLY in code: duplicate ref, amount ===
 * expected.amountMinor, receiver digits / name, time window, QR ref vs vision ref (mismatch → 'suspected_forgery').
 * This is NOT bank verification (no bank API): best target status is S. Unknown / other-tenant file → NOT_FOUND; non-image →
 * VALIDATION_ERROR. A provider failure is a verdict ('technical'), not a throw; PROVIDER_BUDGET_EXHAUSTED → verdict 'technical'
 * with needsStaffReason 'provider_budget'. dryRun false + verdict 'verified' records the ref (a later slip with the same ref → 'duplicate').
 * @fake throws AppError('SERVICE_NOT_READY', 'F14 payments not merged yet') (callers treat it as "skipped").
 */
export declare function analyzeSlip(input: SlipAnalysisInput): Promise<SlipAnalysis>;

// ---- F14 additions (21 Nov): synthetic slip helpers that B1 F37 imports (cross-lane, so they need a contract and a fake) ----
export interface SyntheticSlipSpec {
  amountMinor: number;
  /** ISO UTC. */
  transferredAt: string;
  receiverName: string;
  receiverMasked: string;
  transactionRef: string;
  withQr: boolean;
  qrPayload?: string;
  sendingBank?: string;
  patchAmountMinor?: number;
  blur?: boolean;
  notASlip?: boolean;
}
/**
 * @owner F14 payments · A2 · consumer: B1 F37 (eval slips). Slip-QR payload the F14 decoder accepts (docs/specs/F14 §9).
 * @fake `NLESS-FIXTURE:<transactionRef>` (not decodable as a real slip QR).
 */
export declare function makeSlipQrPayload(transactionRef: string, sendingBank?: string): string;
/** @owner F14 payments · A2 · consumer: B1 F37. false when the server has no font to draw Thai text. @fake false. */
export declare function slipRenderingAvailable(): Promise<boolean>;
/**
 * @owner F14 payments · A2 · consumer: B1 F37. PNG 720×1280 bytes of a labelled synthetic slip (never a real one).
 * @fake throws AppError('SERVICE_NOT_READY') — F37 then reports its slip cases as skipped `needs_f14`.
 */
export declare function renderSyntheticSlip(spec: SyntheticSlipSpec): Promise<Uint8Array>;

// ═══ target: shared/features/live-commerce/types.ts + server/src/features/live-commerce/service.ts — F22 live-commerce · A2 ═══

/** One product code found in a text. Prices and names come from the catalog, never from the text. */
export interface ProductCodeMatch {
  code: string;
  /** Normalised key used for lookups (upper-case, NFKC). */
  codeKey: string;
  itemId: string;
  variantId: string | null;
  quantity: number;
  note: string;
  name: string | null;
  sku: string | null;
  unitPriceMinor: number | null;
  soldOut: boolean;
  /** true = the item has variants and the code does not pick one. */
  needsVariant: boolean;
}
/** @owner F22 live-commerce · A2 · consumers: C2 F21 comments, B2 F10 (cross-lane since v3)
 *  Reads product codes in a customer message. Only codes registered for THIS business count. A code must stand alone (not inside a
 *  word: 'XA12', 'A12B' do not match 'A12'); a code containing Thai letters must be separated from Thai text by whitespace or punctuation.
 *  Quantity 1-99 may follow: 'A12x2', 'A12 2', 'A12 x 2', 'A12 2ชิ้น', 'A12*3'. At most opts.maxCodes (default 10; comments use 3) distinct codes,
 *  repeated codes add their quantities (cap 99). Codes whose item is deleted/inactive are skipped. resolve (default true) fills name / sku / price
 *  / soldOut from the catalog (never trust the text for prices). Never throws for unknown text: returns [].
 *  @fake [] */
export declare function findProductCodes(businessId: string, text: string, opts?: { maxCodes?: number; resolve?: boolean }): Promise<ProductCodeMatch[]>;

// ═══ target: shared/features/booking/types.ts + server/src/features/booking/service.ts — F15 booking · A3 ═══

export interface SlotOption {
  serviceId: string;
  resourceId: string;
  resourceName: string;
  startAt: string;
  endAt: string;
  capacity: number;
  remaining: number;
  /** Server-rendered Asia/Bangkok label in query.language (default: the business language): '22 พ.ย. 2569 10:00' | '22 Nov 2026 10:00'. */
  localDisplay: string;
}
export interface AppointmentSummary {
  id: string;
  businessId: string;
  conversationId: string | null;
  serviceId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
  /** F16 calendar sync is separate from the local booking. */
  externalSync: { state: 'not_configured' | 'pending' | 'synced' | 'failed' };
  version: number;
}
export type CreateBookingInput =
  | {
      stage: 'propose';
      businessId: string;
      conversationId: string;
      serviceRef: ProductRef;
      resourceId?: string;
      startAt: string;
      customerName?: string;
      clientRequestId: string;
      /** Language of review.localDisplay and proposal.summary. Omitted → getCustomerLanguage(conversationId). */
      language?: CustomerLanguage;
    }
  | ({
      stage: 'confirm';
      businessId: string;
      conversationId: string;
      actor: { kind: 'customer' | 'staff'; userId?: string | null };
    } & ConfirmRequest);
export type CreateBookingResult =
  | { stage: 'propose'; state: 'awaiting_confirmation'; proposal: ProposalSummary; review: BookingReviewPart }
  | { stage: 'confirm'; receiptId: string; replayed: boolean; appointment: AppointmentSummary | null; decision: 'confirm' | 'cancel' };
/**
 * @owner F15 booking · A3 · consumers: B2 (AI tool), A3 calendar
 * Free slots for a service between from/to (ISO UTC), respecting hours (getBusinessSettings), closures, capacity.
 * @fake SEED.slots of that business/service inside [from, to) with remaining = capacity (1).
 *   A-SERVICE-01 → 2026-11-22T03:00:00Z–03:30:00Z (10:00–10:30 Bangkok), resource A1.
 */
export declare function findSlots(
  businessId: string,
  query: { serviceRef: ProductRef; from: string; to: string; resourceId?: string; limit?: number; language?: CustomerLanguage },
): Promise<SlotOption[]>;

/**
 * @owner F15 booking · A3. Same two-stage consent shape as orders.
 * confirm: capacity re-checked in a transaction (two racers for a capacity-1 slot → one wins, the other
 * SLOT_FULL); idempotency like orders; externalSync starts 'pending' or 'not_configured'.
 * @fake propose: from SEED.slots, not persisted, ids `fake-proposal-<clientRequestId>`; slot not in SEED → SLOT_FULL.
 *   confirm: throws AppError('SERVICE_NOT_READY', 'F15 booking not merged yet') (R8).
 */
export declare function createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;

// ═══ target: shared/features/crm/types.ts + server/src/features/crm/service.ts — F24 crm · A3 ═══

export interface CustomerSummary {
  id: string;
  businessId: string;
  displayName: string;
  channel: Channel;
  externalId: string;
  tagIds: string[];
  marketingConsent: MarketingConsent;
  lastSeenAt: string | null;
}
export interface CustomerProfile extends CustomerSummary {
  /** Manual = set by staff; inferred = model/automation guess, shown as inferred, never as fact. */
  tags: { id: string; name: string; source: 'manual' | 'automation' | 'inferred' }[];
  contact: { phone?: string | null; email?: string | null; address?: string | null };
  note: string | null;
  firstSeenAt: string | null;
}
/**
 * @owner F24 crm · A3 · consumers: A1 broadcast, B3 insights, B2 ai-agent, A2
 * Identity row is the core `customers` table (written by inbox saveMessage); F24 keeps profile/tags/marketing consent
 * (broadcast opt-out) in its own tables keyed by customer id. Null when missing/other business (R3).
 * @fake core customers row + SEED.tags/consent; contact all null, note null.
 */
export declare function getCustomer(businessId: string, customerId: string): Promise<CustomerProfile | null>;

/**
 * @owner F24 crm · A3. Customers having ANY of tagIds. opts.requireConsent 'granted' drops revoked/unknown
 * (broadcast must still re-check consent at send time).
 * @fake SEED.tags × SEED.customers: tag_vip_a → A Customer One (granted) + A Customer Two (revoked).
 */
export declare function listCustomersByTags(
  businessId: string,
  tagIds: string[],
  opts?: { cursor?: string | null; limit?: number; requireConsent?: 'granted' },
): Promise<Page<CustomerSummary>>;

/** One tag of the business with how many customers carry it. */
export interface TagSummary {
  id: string;
  name: string;
  customerCount: number;
}
/**
 * @owner F24 crm · A3 · consumer: A1 F23 broadcast (audience picker, validation of tag ids)
 * Every tag of the business, sorted by name; customerCount excludes deleted customers.
 * @fake tags derived from SEED customers of that business (id = name).
 */
export declare function listTags(businessId: string): Promise<TagSummary[]>;

// ═══ target: shared/features/notifications/types.ts + server/src/features/notifications/service.ts — F31 · C3 ═══

export interface NotifyInput {
  businessId: string;
  /** Explicit users, or every active owner of the business. Recipients must be members (no cross-tenant). */
  to: { userIds: string[] } | { role: 'owners' } | { permission: PermissionKey };
  type: 'chat.handoff' | 'chat.mention' | 'order.created' | 'payment.verifying' | 'booking.created' | 'booking.cancelled' | 'invitation' | 'report' | 'system';
  title: string;
  body?: string;
  /** In-app path, e.g. '/chat?c=<id>'. Never an external URL from user/model content. */
  link?: string;
  /** Same key again → no new notification. */
  dedupKey?: string;
}
/**
 * @owner F31 notifications · C3 · consumers: every lane
 * Persists per-recipient notifications, publishes 'notification.created' to those users, optional web push.
 * @fake no write: logs `[notify:fake] <type> <title>` and returns { notificationIds: [], mode: 'sandbox' }.
 */
export declare function notify(input: NotifyInput): Promise<{ notificationIds: string[]; mode: 'real' | 'sandbox' }>;

// ═══ target: shared/features/voice/types.ts — F30 voice · B2 (P3) ═══
// Types only: no other lane calls F30, so there is no service.ts contract. Flow: docs/openai-api.md §10.2.
// The browser talks audio straight to OpenAI Realtime over WebRTC with the ephemeral client secret core minted
// (model.createRealtimeSession). Everything that touches shop data runs on OUR server, keyed by voiceSessionId.
// Routes (F30 owns them, paths relative to /api/v1; auth via the cookie session + ctx.requireBusiness):
//   POST /voice/sessions                         → VoiceSessionStartResponse
//   POST /voice/sessions/:voiceSessionId/tools   VoiceToolRequest  → VoiceToolResponse
//   POST /voice/sessions/:voiceSessionId/usage   VoiceUsageReport  → VoiceUsageAck
//   POST /voice/sessions/:voiceSessionId/end     → VoiceSession
//   POST /voice/sessions/:voiceSessionId/transcript  VoiceTranscriptRequest → { saved: boolean }
//        (added in v3: the browser is the only source of captions; the server stores them with saveMessage triggerAi false)
// Rules:
//  - businessId / customerId are bound SERVER-SIDE when the session is created (VoiceSession row); later calls take
//    only voiceSessionId and never trust a business, customer, price or tool result sent by the browser.
//  - Unknown session, or one created by another user / business → NOT_FOUND. Session ended, expired
//    (past expiresAt) or capped → POLICY_BLOCKED (422, details.reason 'voice_session_ended' | 'voice_cap').
//  - Tools: only VoiceToolName; arguments validated with zod (VALIDATION_ERROR); same services as the F10 chat tools
//    (searchKnowledge, getPrice, findSlots, createBooking stage 'propose' only — the customer still confirms as in chat).
//  - VOICE_MAX_SECONDS per session and VOICE_DAILY_SECONDS per demo tenant are a cost guard, not a customer quota:
//    when reached the server stops issuing secrets / answering tools and tells the browser to hang up.
//  - Usage: the browser posts every response.done usage; the server dedups by responseId (a response is never
//    counted twice) and calls model.recordRealtimeUsage (client-reported numbers → shown as estimates in F27).
//  - Customer transcripts may be saved with inbox saveMessage({ ..., triggerAi: false }).

export type VoiceToolName = 'search_knowledge' | 'get_price' | 'find_slots' | 'create_booking';
/** One finished caption line relayed by the browser (Realtime transcript events). Text is data, never authority. */
export interface VoiceTranscriptRequest {
  /** Realtime conversation item id (dedup key per session). */
  itemId: string;
  role: 'customer' | 'assistant';
  text: string;
  interrupted?: boolean;
}
export interface VoiceSession {
  voiceSessionId: string;
  businessId: string;
  /** The customer the session acts for (Demo Voice visitor = a 'web' customer row); null = staff test. */
  customerId: string | null;
  conversationId: string | null;
  /** Staff user who opened it (Demo Voice page) or null for a customer-facing page. */
  createdByUserId: string | null;
  state: 'active' | 'ended' | 'expired' | 'capped';
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
  startedAt: string;
  /** min(client secret expiry, startedAt + VOICE_MAX_SECONDS). */
  expiresAt: string;
  /** Server-clock seconds from startedAt to the last tool/usage call or end (never from the browser's clock). */
  secondsUsed: number;
}
export interface VoiceSessionStartResponse {
  voiceSessionId: string;
  /** model.createRealtimeSession().clientSecret — ephemeral, never the API key. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
  maxSeconds: number;
}
/** One realtime function_call relayed by the browser (response.done → output[] item of type 'function_call'). */
export interface VoiceToolRequest {
  /** The function_call's call_id (echoed back as function_call_output.call_id). */
  callId: string;
  name: VoiceToolName;
  /** Raw JSON string from the model. Data, not authority. */
  arguments: string;
}
export interface VoiceToolResponse {
  callId: string;
  /** JSON string the browser sends as conversation.item.create { type: 'function_call_output', call_id, output }. */
  output: string;
}
export interface VoiceUsageReport {
  /** Realtime response id (dedup key). */
  responseId: string;
  /** response.done.response.usage as received. Validated by core model.recordRealtimeUsage. */
  usage: unknown;
}
export interface VoiceUsageAck {
  usageId: string;
  secondsUsed: number;
  /** true → the cap is reached: the browser closes the RTCPeerConnection. */
  capped: boolean;
}
