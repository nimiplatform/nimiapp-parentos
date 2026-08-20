import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProfile } from '../../app-shell/app-store.js';
import { i18n } from '../../i18n/index.js';
import { buildReportSystemPrompt, generateNarrativeReportForPeriod, type AllDomainData } from './narrative-prompt.js';

const { runParentosTextGenerateMock } = vi.hoisted(() => ({
  runParentosTextGenerateMock: vi.fn(),
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosTextGenerate: runParentosTextGenerateMock,
}));

const child: ChildProfile = {
  childId: 'child-1',
  familyId: 'family-1',
  displayName: '王小爬',
  gender: 'male',
  birthDate: '2017-01-01',
  birthWeightKg: null,
  birthHeightCm: null,
  birthHeadCircCm: null,
  avatarPath: null,
  nurtureMode: 'balanced',
  nurtureModeOverrides: null,
  allergies: null,
  medicalNotes: null,
  recorderProfiles: null,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

function emptyData(): AllDomainData {
  return {
    measurements: [],
    milestones: [],
    vaccines: [],
    journalEntries: [],
    reminderStates: [],
    sleepRecords: [],
    dentalRecords: [],
    allergyRecords: [],
    medicalEvents: [],
    fitnessAssessments: [],
    tannerAssessments: [],
  };
}

describe('sparse monthly report narration', () => {
  beforeEach(async () => {
    runParentosTextGenerateMock.mockReset();
    await i18n.changeLanguage('zh');
  });

  it('uses a factual local narrative without asking the model to infer from no evidence', async () => {
    const report = await generateNarrativeReportForPeriod({
      child,
      period: { start: '2026-08-17T00:00:00.000Z', end: '2026-09-16T23:59:59.999Z' },
      data: emptyData(),
      reportType: 'monthly',
    });

    expect(runParentosTextGenerateMock).not.toHaveBeenCalled();
    expect(report.content).toMatchObject({ version: 2, format: 'narrative', reportType: 'monthly' });
    expect(JSON.stringify(report.content)).toContain('不推断整体状态或变化趋势');
    expect(JSON.stringify(report.content)).not.toContain('平稳');
  });

  it('does not instruct the model to emit percentile rankings or same-age positioning', () => {
    const prompt = buildReportSystemPrompt(child.displayName);

    expect(prompt).not.toContain('P75');
    expect(prompt).not.toContain('同龄孩子中处于较高水平');
    expect(prompt).toContain('不输出百分位排名');
  });
});
