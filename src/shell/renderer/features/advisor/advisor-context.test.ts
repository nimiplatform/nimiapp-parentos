import { describe, expect, it } from 'vitest';
import type { HealthRecordEventRow, HealthRecordValueRow, JournalEntryRow } from '../../bridge/sqlite-bridge.js';
import {
  describeAdvisorFactSources,
  fitAdvisorFactsToBudget,
  modelFacingFacts,
  projectAdvisorFacts,
  resolveAdvisorPeriod,
  summarizeAdvisorFacts,
  type AdvisorChildContext,
  type AdvisorRawSources,
  type AdvisorRecordGroupId,
} from './advisor-context.js';

const child: AdvisorChildContext = {
  childId: 'child-a',
  displayName: '小安',
  gender: 'female',
  birthDate: '2013-06-01',
  nurtureMode: 'balanced',
  ageMonths: 159,
  recorderProfiles: [{ id: 'mom', name: '妈妈' }],
};

let seq = 0;
function healthEvent(input: {
  protocolId: string;
  groupId: string;
  date: string;
  values: Array<{ metricId: string; valueNumber?: number | null; valueText?: string | null; unit?: string | null; valueJson?: string | null }>;
  notes?: string | null;
  metadataJson?: string | null;
  childId?: string;
}) {
  seq += 1;
  const eventId = `e${seq}`;
  const event: HealthRecordEventRow = {
    eventId,
    childId: input.childId ?? child.childId,
    protocolId: input.protocolId,
    groupId: input.groupId,
    recordKind: 'manual',
    sourceSurface: 'profile_detail',
    recordedAt: `${input.date}T08:00:00.000Z`,
    effectiveDate: input.date,
    ageMonths: 159,
    recorderId: null,
    linkedReminderStateId: null,
    linkedReminderRuleId: null,
    notes: input.notes ?? null,
    metadataJson: input.metadataJson ?? null,
    createdAt: `${input.date}T08:00:00.000Z`,
    updatedAt: `${input.date}T08:00:00.000Z`,
  };
  const values: HealthRecordValueRow[] = input.values.map((value, index) => ({
    valueId: `${eventId}-v${index}`,
    eventId,
    childId: input.childId ?? child.childId,
    metricId: value.metricId,
    valueNumber: value.valueNumber ?? null,
    valueText: value.valueText ?? null,
    valueJson: value.valueJson ?? null,
    unit: value.unit ?? null,
    qualifier: null,
    recordKind: 'measured',
    sourceValueIds: null,
    createdAt: `${input.date}T08:00:00.000Z`,
  }));
  return { event, values };
}

function health(...items: Array<ReturnType<typeof healthEvent>>): AdvisorRawSources['health'] {
  return { status: 'ok', rows: { events: items.map((item) => item.event), values: items.flatMap((item) => item.values) } };
}

const outdoor = (date: string, minutes: number) => healthEvent({
  protocolId: 'outdoor-activity', groupId: 'outdoor', date, values: [{ metricId: 'outdoor.activity_minutes', valueNumber: minutes, unit: 'min' }],
});

function project(sources: AdvisorRawSources, groups: AdvisorRecordGroupId[], today = '2026-09-30', time: Parameters<typeof resolveAdvisorPeriod>[0] = { kind: 'default' }) {
  return projectAdvisorFacts({
    child,
    sources,
    groups,
    period: resolveAdvisorPeriod(time, today, child.birthDate),
    today,
    requestedAt: `${today}T10:00:00.000Z`,
  });
}

describe('resolveAdvisorPeriod', () => {
  it('uses the 30 local days ending on the request date by default', () => {
    expect(resolveAdvisorPeriod({ kind: 'default' }, '2026-09-30', child.birthDate))
      .toEqual({ kind: 'default', start: '2026-09-01', end: '2026-09-30', defaulted: true });
  });

  it('resolves calendar expressions against the frozen date and never past today', () => {
    expect(resolveAdvisorPeriod({ kind: 'this-week' }, '2026-09-30', child.birthDate)).toMatchObject({ start: '2026-09-28', end: '2026-09-30' });
    expect(resolveAdvisorPeriod({ kind: 'last-week' }, '2026-09-30', child.birthDate)).toMatchObject({ start: '2026-09-21', end: '2026-09-27' });
    expect(resolveAdvisorPeriod({ kind: 'last-month' }, '2026-09-30', child.birthDate)).toMatchObject({ start: '2026-08-01', end: '2026-08-31' });
    expect(resolveAdvisorPeriod({ kind: 'range', start: '2026-09-20', end: '2026-12-31' }, '2026-09-30', child.birthDate))
      .toMatchObject({ start: '2026-09-20', end: '2026-09-30' });
    expect(resolveAdvisorPeriod({ kind: 'recent-days', days: 7 }, '2026-09-30', child.birthDate)).toMatchObject({ start: '2026-09-24', end: '2026-09-30' });
    expect(resolveAdvisorPeriod({ kind: 'all' }, '2026-09-30', child.birthDate)).toMatchObject({ start: '2013-06-01' });
  });
});

describe('projectAdvisorFacts: outdoor', () => {
  it('counts only recorded minutes up to the request date and keeps the parent goal apart', () => {
    const facts = project({
      health: health(outdoor('2026-09-28', 60), outdoor('2026-09-29', 30), outdoor('2026-10-01', 45), outdoor('2026-09-25', 40)),
      outdoorGoal: { status: 'ok', rows: 630 },
    }, ['outdoor']);
    const group = facts.groups[0];
    expect(group).toMatchObject({ group: 'outdoor', status: 'ok', latestRecordDate: '2026-09-29' });
    expect(group?.data).toMatchObject({
      weeklyGoal: { minutes: 630, setBy: '家长设定' },
      thisWeekSoFar: { start: '2026-09-28', end: '2026-09-30', totalMinutes: 90, recordedDays: 2 },
      lastWeek: { start: '2026-09-21', end: '2026-09-27', totalMinutes: 40, recordedDays: 1 },
      periodTotalMinutes: 130,
    });
    expect(JSON.stringify(group?.data)).not.toContain('2026-10-01');
  });

  it('marks an unset goal as the app default, never as the parent goal', () => {
    const facts = project({ health: health(outdoor('2026-09-28', 60)), outdoorGoal: { status: 'ok', rows: null } }, ['outdoor']);
    expect(facts.groups[0]?.data?.weeklyGoal).toEqual({ minutes: 630, setBy: '应用默认值，家长未设定' });
  });

  it('keeps an explicit zero as a recorded day and moves the week at Monday', () => {
    const sources = { health: health(outdoor('2026-10-04', 0), outdoor('2026-10-05', 20)), outdoorGoal: { status: 'ok' as const, rows: 630 } };
    const sunday = project(sources, ['outdoor'], '2026-10-04');
    expect(sunday.groups[0]?.data).toMatchObject({ thisWeekSoFar: { start: '2026-09-28', totalMinutes: 0, recordedDays: 1 } });
    const monday = project(sources, ['outdoor'], '2026-10-05');
    expect(monday.groups[0]?.data).toMatchObject({
      thisWeekSoFar: { start: '2026-10-05', totalMinutes: 20, recordedDays: 1 },
      lastWeek: { start: '2026-09-28', totalMinutes: 0, recordedDays: 1 },
    });
  });
});

describe('projectAdvisorFacts: sleep and vision', () => {
  it('keeps night sleep and naps apart and counts only recorded nights', () => {
    const night = (date: string, minutes: number, napMinutes?: number) => healthEvent({
      protocolId: 'sleep-night', groupId: 'sleep', date,
      values: [{ metricId: 'sleep.duration_minutes', valueNumber: minutes, unit: 'min' }],
      metadataJson: JSON.stringify({ bedtime: '22:40', wakeTime: '06:50', napMinutes: napMinutes ?? null }),
    });
    const facts = project({ health: health(night('2026-09-20', 480, 30), night('2026-09-21', 500), night('2026-08-01', 300)) }, ['sleep']);
    expect(facts.groups[0]?.data).toMatchObject({
      periodDays: 30,
      recordedNights: 2,
      averageNightMinutes: 490,
      averageNapMinutesOnNapDays: 30,
      napDays: 1,
      averageTotalMinutes: 505,
      averageBedtime: '22:40',
    });
  });

  it('keeps each eye apart, compares only same-unit records and never invents a trend from one record', () => {
    const exam = (date: string, left: number, right: number) => healthEvent({
      protocolId: 'vision-basic', groupId: 'vision', date, notes: '未散瞳',
      values: [
        { metricId: 'vision.left_visual_acuity', valueNumber: left },
        { metricId: 'vision.right_visual_acuity', valueNumber: right },
      ],
    });
    const two = project({ health: health(exam('2026-03-02', 5.0, 5.0), exam('2026-09-10', 4.9, 5.0)) }, ['vision']);
    const metrics = two.groups[0]?.data?.metrics as Array<Record<string, unknown>>;
    expect(metrics).toHaveLength(2);
    const left = metrics.find((metric) => String(metric.metric).includes('左') || String(metric.metric).toLowerCase().includes('left'));
    expect(left?.latestChange).toMatchObject({ from: { date: '2026-03-02', value: 5 }, to: { date: '2026-09-10', value: 4.9 }, delta: -0.1 });
    expect(left?.inPeriod).toEqual([{ date: '2026-09-10', value: 4.9, note: '未散瞳' }]);

    const one = project({ health: health(exam('2026-03-02', 5.0, 5.0)) }, ['vision']);
    const oldOnly = one.groups[0];
    expect(oldOnly).toMatchObject({ status: 'ok', inPeriodCount: 0, latestRecordDate: '2026-03-02' });
    const oldMetrics = oldOnly?.data?.metrics as Array<Record<string, unknown>>;
    expect(oldMetrics.every((metric) => metric.latestChange === undefined && metric.latestBeforePeriod)).toBe(true);
    expect(modelFacingFacts(one).records[0]?.periodNote).toBe('最近 30 天（2026-09-01 至 2026-09-30）内没有这一类记录；最近一次是更早的 2026-03-02');
  });

  it('words enum values for parents instead of passing stored codes', () => {
    const facts = project({
      health: health(
        healthEvent({ protocolId: 'fitness-school-assessment', groupId: 'fitness', date: '2026-09-20', values: [{ metricId: 'fitness.foot_arch_status', valueText: 'flat' }] }),
        healthEvent({
          protocolId: 'fitness-sport-activity', groupId: 'fitness', date: '2026-09-21',
          values: [{ metricId: 'fitness.activity_category', valueText: 'table-tennis' }, { metricId: 'fitness.activity_intensity', valueText: 'vigorous' }],
        }),
      ),
    }, ['fitness']);
    const data = facts.groups[0]?.data as { tests: Array<Record<string, unknown>>; activitiesInPeriod: Array<Record<string, unknown>> };
    expect(data.tests[0]?.inPeriod).toEqual([{ date: '2026-09-20', value: '扁平足' }]);
    expect(data.activitiesInPeriod[0]).toMatchObject({ category: '乒乓球', intensity: '高强度' });
    expect(JSON.stringify(modelFacingFacts(facts))).not.toMatch(/flat|table-tennis|vigorous/u);
  });
});

describe('projectAdvisorFacts: statuses', () => {
  it('reports a failed source as a read failure, never as no records, and skips unrequested groups', () => {
    const journal: JournalEntryRow = {
      entryId: 'j1', childId: child.childId, contentType: 'text', textContent: '作业写到很晚，十一点才睡。'.repeat(30), voicePath: null, photoPaths: null,
      recordedAt: '2026-09-27T13:00:00.000Z', ageMonths: 159, observationMode: null, dimensionId: null, selectedTags: '["作业"]',
      guidedAnswers: null, observationDuration: null, keepsake: 0, moodTag: null, recorderId: 'mom', createdAt: '2026-09-27T13:00:00.000Z', updatedAt: '2026-09-27T13:00:00.000Z',
    };
    const facts = project({ health: { status: 'failed' }, journal: { status: 'ok', rows: [journal] } }, ['vision', 'journal']);
    expect(facts.groups.map((group) => [group.group, group.status])).toEqual([['vision', 'read-failed'], ['journal', 'ok']]);
    const entry = (facts.groups[1]?.data?.entries as Array<Record<string, unknown>>)[0];
    expect(entry).toMatchObject({ date: '2026-09-27', recorder: '妈妈', tags: ['作业'] });
    expect(String(entry?.parentText).length).toBe(241);
    expect(String(entry?.parentText).endsWith('…')).toBe(true);
    expect(summarizeAdvisorFacts(facts).map((group) => group.group)).toEqual(['journal']);
    const records = modelFacingFacts(facts).records;
    expect(records.map((record) => record.category)).toEqual(['随记', '视力']);
    expect(records[1]).toMatchObject({ status: 'read-failed' });
    expect(records[1]?.periodNote).toBeUndefined();
    expect(records[0]).toMatchObject({ periodNote: '最近 30 天（2026-09-01 至 2026-09-30）内有 1 条记录' });
  });

  it('marks a category with no rows at all as no-records', () => {
    const facts = project({ health: health() }, ['dental']);
    expect(facts.groups[0]).toMatchObject({ group: 'dental', status: 'empty', latestRecordDate: null });
    expect(modelFacingFacts(facts).records[0]).toMatchObject({ status: 'no-records' });
  });
});

describe('budget and provenance', () => {
  it('trims listed rows but keeps totals, statistics and every series', () => {
    const nights = Array.from({ length: 30 }, (_, index) => healthEvent({
      protocolId: 'sleep-night', groupId: 'sleep', date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      values: [{ metricId: 'sleep.duration_minutes', valueNumber: 480 + index, unit: 'min' }],
    }));
    const facts = project({ health: health(...nights) }, ['sleep']);
    // Statistics cover all 30 nights; only the latest 14 are listed.
    expect(facts.groups[0]?.data).toMatchObject({ recordedNights: 30, averageNightMinutes: 495, earlierNightsOmitted: 16 });
    expect(facts.groups[0]?.data?.nights).toHaveLength(14);
    expect(facts.groups[0]?.includedDates).toHaveLength(30);
    const fitted = fitAdvisorFactsToBudget(facts, 900);
    expect(fitted.trimmed).toEqual(['睡眠']);
    expect(fitted.groups[0]?.data).toMatchObject({ recordedNights: 30, averageNightMinutes: 495 });
    expect((fitted.groups[0]?.data?.nights as unknown[]).length).toBeLessThan(14);
    expect(fitted.groups[0]?.data?.nightsTrimmed).toBeGreaterThan(0);
  });

  it('names categories with their dates, or a span when there are many', () => {
    const facts = project({
      health: health(outdoor('2026-09-28', 60), outdoor('2026-09-29', 30)),
      outdoorGoal: { status: 'ok', rows: 630 },
    }, ['outdoor']);
    expect(describeAdvisorFactSources(facts)).toBe('户外活动（2026-09-28、2026-09-29）');
  });
});
