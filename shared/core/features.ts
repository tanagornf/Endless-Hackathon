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
  { id: 'F30', slug: 'voice', lane: 'C2', title: 'Browser voice (OpenAI Realtime)', mvp: false, tier: 'P3', folder: true, webPaths: ['/voice', '/call'] },
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
 * Tiers: C1 F01 P0 → F35 P0 → F39 P2 → F36 P1 (15:15 by the clock; F39 pauses then) · C2 F17 P0 → F18 P1 → F21 P2 → F30 P3 ·
 * C3 F04 P0 → F03 P0 → F02 P1 → F31 P2 · B1 F05 → F07 → F08 (all P0) → F37 P2 · B2 F10 P0 → F38 P2 ·
 * B3 F06 P1 → F26 P2 → F27 P2 · A1 F09 P0 → F11 P0 → F12 P2 → F23 P2 · A2 F13 → F14 → F22 (all P1) ·
 * A3 F24 P1 → F15 P2 → F16 P2.
 * A2, A3 and B3 have no P0 work: they read their specs and plan until `LEAD: OPEN P1`.
 */
export const LANE_ORDER: Record<Lane, readonly FeatureId[]> = {
  C1: ['F01', 'F35', 'F39', 'F36'],
  C2: ['F17', 'F18', 'F21', 'F30'],
  C3: ['F04', 'F03', 'F02', 'F31'],
  B1: ['F05', 'F07', 'F08', 'F37'],
  B2: ['F10', 'F38'],
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
