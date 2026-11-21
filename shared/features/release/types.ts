export type Mode = 'R' | 'S' | 'A' | 'U';

export interface ReleaseFeatureRow {
  featureId: string;
  slug: string;
  name: string;
  lane: string;
  tier: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'DONE' | 'DOING' | 'BLOCKED' | 'UNIMPLEMENTED';
  targetMode: Mode;
  actualMode: Mode;
  providerGate: string;
  commitSha: string;
  testsEvidence: string;
  checkedAtBangkok: string;
  blocker: string;
  evidenceFile: string;
  downgradedFrom: Mode | null;
  downgradeReason: string | null;
  links: { evidence: string; commit: string | null };
}

export interface ReleaseStatusFile {
  generatedAt: string | null;
  generatedFromSha: string;
  baselineSha: string;
  repoUrl: string;
  totals: Record<Mode, number>;
  rows: ReleaseFeatureRow[];
}

export interface ReleaseFlag {
  featureId: string;
  hidden: boolean;
  placeholder: boolean;
  visible: boolean;
}

export interface ReleaseConflict {
  featureId: string;
  kind: 'claims_R_but_hidden' | 'hidden_not_listed' | 'R_but_placeholder';
}

export interface ReleaseStatusView extends ReleaseStatusFile {
  build: { sha: string; shortSha: string; env: string; schema: string | null; modelMode: 'openai' | 'fake';
    providerModes: Record<string, string>; startedAt: string };
  flags: ReleaseFlag[];
  conflicts: ReleaseConflict[];
  stale: boolean;
  lastGreen: { sha: string; verifiedAt: string } | null;
}
