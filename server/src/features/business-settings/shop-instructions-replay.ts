import { z } from 'zod';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const outcome = z.object({
  fixtureId: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  language: z.enum(['th', 'en']),
  arm: z.enum(['baseline', 'candidate', 'negative', 'cross_shop']),
  expectedCase: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  actualResult: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  passed: z.boolean(),
}).strict();

export const instructionReplaySchema = z.object({
  businessId: z.uuid(),
  candidateId: z.uuid(),
  baseVersionId: z.uuid().nullable(),
  candidateDigest: digest,
  replayRunId: z.uuid(),
  fixtureSetDigest: digest,
  mode: z.enum(['fake', 'openai']),
  outcomes: z.array(outcome).min(1).max(100),
}).strict();

export type InstructionReplay = z.input<typeof instructionReplaySchema>;

export function instructionReplayPassed(outcomes: InstructionReplay['outcomes']): boolean {
  const keys = new Set(outcomes.map(({ arm, language, fixtureId }) => [arm, language, fixtureId].join(':')));
  if (keys.size !== outcomes.length || outcomes.some((result) => result.passed !== (result.expectedCase === result.actualResult))) {
    return false;
  }

  const candidate = outcomes.filter(({ arm }) => arm === 'candidate');
  const th = candidate.filter(({ language }) => language === 'th');
  const en = candidate.filter(({ language }) => language === 'en');
  const improved = outcomes.some((before) => before.arm === 'baseline' && !before.passed
    && candidate.some((after) => after.passed && after.fixtureId === before.fixtureId
      && after.language === before.language && after.expectedCase === before.expectedCase));

  return improved
    && th.some((thai) => en.some((english) => thai.fixtureId !== english.fixtureId))
    && outcomes.some(({ arm }) => arm === 'negative')
    && outcomes.some(({ arm }) => arm === 'cross_shop')
    && outcomes.every(({ arm, passed }) => arm === 'baseline' || passed);
}
