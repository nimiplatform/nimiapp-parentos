import { afterEach, describe, expect, it } from 'vitest';
import { i18n, i18nText } from '../../i18n/index.js';
import { buildStructuredGrowthReport, parseReportContent, parseStructuredGrowthReportContent } from './structured-report.js';

describe('structured-report', () => {
  const originalLanguage = i18n.language;
  afterEach(async () => { await i18n.changeLanguage(originalLanguage); });
  const child = {
    childId: 'child-1',
    familyId: 'family-1',
    displayName: 'Mimi',
    gender: 'female' as const,
    birthDate: '2024-01-15',
    birthWeightKg: null,
    birthHeightCm: null,
    birthHeadCircCm: null,
    avatarPath: null,
    nurtureMode: 'balanced' as const,
    nurtureModeOverrides: null,
    allergies: null,
    medicalNotes: null,
    recorderProfiles: [{ id: 'mom', name: 'Mom' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('builds a structured local report without free-form AI content', () => {
    const report = buildStructuredGrowthReport({
      child,
      reportType: 'quarterly-letter',
      now: '2026-04-03T00:00:00.000Z',
      measurements: [
        {
          measurementId: 'm-0',
          childId: 'child-1',
          typeId: 'height',
          value: 96.8,
          measuredAt: '2026-03-20T00:00:00.000Z',
          ageMonths: 26,
          percentile: null,
          source: 'manual',
          notes: null,
          createdAt: '2026-03-20T00:00:00.000Z',
        },
        {
          measurementId: 'm-1',
          childId: 'child-1',
          typeId: 'height',
          value: 98.4,
          measuredAt: '2026-04-01T00:00:00.000Z',
          ageMonths: 26,
          percentile: null,
          source: 'manual',
          notes: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      milestones: [
        {
          recordId: 'ms-1',
          childId: 'child-1',
          milestoneId: 'PO-MS-LANG-001',
          achievedAt: '2026-03-15T00:00:00.000Z',
          ageMonthsWhenAchieved: 25,
          notes: null,
          photoPath: null,
          createdAt: '2026-03-15T00:00:00.000Z',
          updatedAt: '2026-03-15T00:00:00.000Z',
        },
      ],
      vaccines: [],
      journalEntries: [
        {
          entryId: 'j-1',
          childId: 'child-1',
          contentType: 'mixed',
          textContent: 'Observed block play.',
          voicePath: 'C:/voice/entry.webm',
          photoPaths: null,
          recordedAt: '2026-04-02T00:00:00.000Z',
          ageMonths: 25,
          observationMode: 'five-minute',
          dimensionId: 'PO-OBS-CONC-001',
          selectedTags: '["focus"]',
          guidedAnswers: null,
          observationDuration: 5,
          keepsake: 1,
          moodTag: null,
          recorderId: 'mom',
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z',
        },
      ],
      reminderStates: [
        {
          stateId: 'r-1',
          childId: 'child-1',
          ruleId: 'PO-REM-VAC-001',
          status: 'pending',
          activatedAt: null,
          completedAt: null,
          dismissedAt: null,
          dismissReason: null,
          repeatIndex: 0,
          nextTriggerAt: null,
          snoozedUntil: null,
          scheduledDate: null,
          notApplicable: 0,
          plannedForDate: null,
          surfaceRank: null,
          lastSurfacedAt: null,
          surfaceCount: 0,
          notes: null,
          acknowledgedAt: null,
          reflectedAt: null,
          practiceStartedAt: null,
          practiceLastAt: null,
          practiceCount: 0,
          practiceHabituatedAt: null,
          consultedAt: null,
          consultationConversationId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    expect(report.content.version).toBe(1);
    expect(report.content.format).toBe('structured-local');
    expect(report.content.reportType).toBe('quarterly-letter');
    expect(report.content.trendSignals.length).toBeGreaterThan(0);
    const v1 = report.content as { sections: Array<{ id: string }> };
    expect(v1.sections.some((section) => section.id === 'journal')).toBe(true);
    expect(report.content.safetyNote).toBe(i18nText('Reports.structured.safetyNote'));
  });

  it('rejects malformed stored payloads', () => {
    expect(() => parseStructuredGrowthReportContent('{"format":"invalid"}')).toThrow(/invalid structured growth report/i);
  });

  it('persists Chinese report copy without notation tokens or internal observation IDs', async () => {
    await i18n.changeLanguage('zh');
    const measurements = ['bone-age', 'vision-left'].flatMap((typeId) => [
      ['2026-03-01T00:00:00.000Z', typeId === 'bone-age' ? 3 : 0.8],
      ['2026-04-01T00:00:00.000Z', typeId === 'bone-age' ? 3.1 : 0.9],
    ].map(([date, value], index) => ({
      measurementId: `${typeId}-${index}`, childId: child.childId, typeId,
      measuredAt: String(date), value: Number(value), ageMonths: 26,
      percentile: null, source: 'manual', notes: null, createdAt: String(date),
    })));
    const built = buildStructuredGrowthReport({
      child, reportType: 'monthly', now: '2026-05-01T00:00:00.000Z',
      periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-30T23:59:59.999Z',
      measurements, milestones: [], vaccines: [], reminderStates: [],
      journalEntries: [{
        entryId: 'journal-zh', childId: child.childId, contentType: 'text',
        textContent: '一起读绘本', voicePath: null, photoPaths: null,
        recordedAt: '2026-04-02T00:00:00.000Z', ageMonths: 26,
        observationMode: 'quick-capture', dimensionId: 'PO-OBS-LANG-001',
        selectedTags: null, guidedAnswers: null, observationDuration: null,
        keepsake: 0, moodTag: null, recorderId: 'deleted-recorder-id',
        createdAt: '2026-04-02T00:00:00.000Z', updatedAt: '2026-04-02T00:00:00.000Z',
      }],
    });
    const saved = parseStructuredGrowthReportContent(JSON.stringify(built.content));
    expect(saved.overview[1]).toBe('本期共 2 次生长测量、1 条日志、0 个里程碑、0 条疫苗记录。');
    const visibleText = JSON.stringify([saved.title, saved.subtitle, saved.overview,
      saved.sections, saved.trendSignals, saved.sources, saved.safetyNote]);
    expect(visibleText).toContain('骨龄：3.1 岁');
    expect(visibleText).toContain('左眼视力：0.9（2026-04-01）');
    expect(visibleText).toContain('观察内容：');
    expect(visibleText).toContain('未命名记录人');
    expect(visibleText).not.toMatch(/decimal|years|needs-review|PO-OBS-|deleted-recorder-id|This window/);
    expect(saved.trendSignals.find((signal) => signal.id === 'measurement-bone-age')?.summary).toContain('+0.1 岁');
  });

  it('rejects unsupported reportType values', () => {
    expect(() => parseStructuredGrowthReportContent(JSON.stringify({
      version: 1,
      format: 'structured-local',
      reportType: 'weekly',
      title: 'Bad payload',
      subtitle: '',
      generatedAt: '2026-04-03T00:00:00.000Z',
      overview: [],
      metrics: [],
      trendSignals: [],
      sections: [],
      sources: [],
      safetyNote: 'facts only',
    }))).toThrow(/invalid structured growth report/i);
  });

  it('accepts custom as a persisted report type', () => {
    const parsed = parseStructuredGrowthReportContent(JSON.stringify({
      version: 1,
      format: 'structured-local',
      reportType: 'custom',
      title: 'Custom payload',
      subtitle: '',
      generatedAt: '2026-04-03T00:00:00.000Z',
      overview: [],
      metrics: [],
      trendSignals: [],
      sections: [],
      sources: [],
      safetyNote: 'facts only',
    }));

    expect(parsed.reportType).toBe('custom');
  });

  it('parseReportContent dispatches v1 and v2 correctly', () => {
    const v1 = JSON.stringify({ version: 1, format: 'structured-local', reportType: 'monthly', title: 'T', subtitle: '', generatedAt: '', overview: [], metrics: [], trendSignals: [], sections: [], sources: [], safetyNote: 'test' });
    expect(parseReportContent(v1).version).toBe(1);
    const v2 = JSON.stringify({ version: 2, format: 'narrative', reportType: 'monthly', title: 'T', subtitle: '', teaser: '', generatedAt: '', narrativeSections: [], actionItems: [], trendSignals: [], metrics: [], sources: [], safetyNote: 'test' });
    expect(parseReportContent(v2).version).toBe(2);
  });

  it('describes sparse windows as sparse without sentinel text and keeps priority action items', () => {
    const report = buildStructuredGrowthReport({
      child,
      reportType: 'monthly',
      now: '2026-04-03T00:00:00.000Z',
      measurements: [],
      milestones: [],
      vaccines: [],
      journalEntries: [],
      reminderStates: [
        {
          stateId: 'r-1',
          childId: 'child-1',
          ruleId: 'PO-REM-VAC-001',
          status: 'overdue',
          activatedAt: null,
          completedAt: null,
          dismissedAt: null,
          dismissReason: null,
          repeatIndex: 0,
          nextTriggerAt: null,
          snoozedUntil: null,
          scheduledDate: null,
          notApplicable: 0,
          plannedForDate: null,
          surfaceRank: null,
          lastSurfacedAt: null,
          surfaceCount: 0,
          notes: null,
          acknowledgedAt: null,
          reflectedAt: null,
          practiceStartedAt: null,
          practiceLastAt: null,
          practiceCount: 0,
          practiceHabituatedAt: null,
          consultedAt: null,
          consultationConversationId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    const content = report.content;
    if (content.version !== 1) throw new Error('expected v1 content');

    // Empty domains stay structurally empty; no English sentinel sentences.
    for (const section of content.sections) {
      for (const item of section.items) {
        expect(item).not.toMatch(/No .* (were|was) recorded/i);
      }
    }
    expect(content.sections.find((s) => s.id === 'growth')?.items).toEqual([]);
    expect(content.sections.find((s) => s.id === 'timeline')?.items).toHaveLength(1);

    // Priority follow-ups surface as clickable action items and round-trip.
    expect(content.actionItems).toHaveLength(1);
    expect(content.actionItems?.[0]?.ruleId).toBe('PO-REM-VAC-001');
    expect(content.actionItems?.[0]).not.toHaveProperty('linkTo');
    const reparsed = parseReportContent(JSON.stringify(content));
    if (reparsed.version !== 1) throw new Error('expected v1 reparse');
    expect(reparsed.actionItems).toHaveLength(1);

    // Age window is formatted for humans, not raw months.
    const ageMetric = content.metrics.find((m) => m.id === 'age-range');
    expect(ageMetric?.value).not.toMatch(/^\d+-\d+ months$/);
    expect(ageMetric?.value).toMatch(/岁|year/);
  });
});
