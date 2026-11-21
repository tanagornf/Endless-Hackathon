import { existsSync, readFileSync } from 'node:fs';
import type { ReleaseConflict, ReleaseFeatureRow, ReleaseFlag, ReleaseStatusFile, ReleaseStatusView } from '@nless/shared/features/release/types';
import { getBuildMetadata } from '../../core';

const repoUrl = 'https://github.com/tanagornf/Endless-Hackathon';
const defaultStatus: ReleaseStatusFile = {
  generatedAt: null, generatedFromSha: '', baselineSha: '', repoUrl, totals: { R: 0, S: 0, A: 0, U: 0 }, rows: [],
};

function readSnapshot<T>(url: URL, fallback: T) {
  if (!existsSync(url)) return fallback;
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

let file: ReleaseStatusFile | undefined;
let lastGreen: ReleaseStatusView['lastGreen'] | undefined;
export function computeConflicts(rows: readonly ReleaseFeatureRow[], flags: readonly ReleaseFlag[]) {
  const modeById = new Map(rows.map((row) => [row.featureId, row.actualMode]));
  const conflicts: ReleaseConflict[] = [];
  for (const { featureId, hidden, placeholder } of flags) {
    const mode = modeById.get(featureId);
    if (hidden && !mode) conflicts.push({ featureId, kind: 'hidden_not_listed' });
    if (mode === 'R' && hidden) conflicts.push({ featureId, kind: 'claims_R_but_hidden' });
    if (mode === 'R' && placeholder) conflicts.push({ featureId, kind: 'R_but_placeholder' });
  }
  return conflicts;
}

export async function getReleaseStatus(readFlags: () => Promise<ReleaseFlag[]>): Promise<ReleaseStatusView> {
  file ??= readSnapshot(new URL('./data/release-status.json', import.meta.url), defaultStatus);
  if (lastGreen === undefined) lastGreen = readSnapshot(new URL('../../../../docs/evidence/last-green.json', import.meta.url), null);
  const [build, flags] = await Promise.all([getBuildMetadata(), readFlags()]);
  return { ...file, build: { ...build, shortSha: build.sha.slice(0, 7) },
    flags, conflicts: computeConflicts(file.rows, flags), stale: file.generatedFromSha !== build.sha, lastGreen };
}
