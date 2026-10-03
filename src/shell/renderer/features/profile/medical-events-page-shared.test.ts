import { describe, expect, it } from 'vitest';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import {
  computeMedicalKpis,
  eventDurationDays,
  groupByDate,
  medicationNames,
  splitMedicationEntries,
  summarizeMedications,
  summarizeVisitReasons,
  visitReason,
} from './medical-events-page-shared.js';

function makeEvent(overrides: Partial<MedicalEventRow> = {}): MedicalEventRow {
  return {
    eventId: 'evt-1',
    childId: 'child-1',
    eventType: 'visit',
    title: '上呼吸道感染',
    eventDate: '2026-05-20',
    endDate: null,
    ageMonths: 55,
    severity: null,
    result: null,
    hospital: null,
    medication: null,
    dosage: null,
    notes: null,
    photoPath: null,
    createdAt: '2026-05-20T08:00:00.000Z',
    updatedAt: '2026-05-20T08:00:00.000Z',
    ...overrides,
  };
}

describe('groupByDate', () => {
  it('groups per calendar day newest first and tags each group with its year', () => {
    const groups = groupByDate([
      makeEvent({ eventId: 'a', eventDate: '2025-11-03' }),
      makeEvent({ eventId: 'b', eventDate: '2026-03-12' }),
      makeEvent({ eventId: 'c', eventDate: '2026-03-12T09:30:00.000Z' }),
      makeEvent({ eventId: 'd', eventDate: '2026-05-20' }),
    ]);
    expect(groups.map((group) => [group.date, group.year, group.events.map((event) => event.eventId)])).toEqual([
      ['2026-05-20', 2026, ['d']],
      ['2026-03-12', 2026, ['b', 'c']],
      ['2025-11-03', 2025, ['a']],
    ]);
  });
});

describe('eventDurationDays', () => {
  it('counts both ends of a multi-day event', () => {
    expect(eventDurationDays({ eventDate: '2026-05-20', endDate: '2026-05-24' })).toBe(5);
    expect(eventDurationDays({ eventDate: '2026-02-27', endDate: '2026-03-02T00:00:00.000Z' })).toBe(4);
  });

  it('ignores missing, same-day and inverted end dates', () => {
    expect(eventDurationDays({ eventDate: '2026-05-20', endDate: null })).toBeNull();
    expect(eventDurationDays({ eventDate: '2026-05-20', endDate: '2026-05-20' })).toBeNull();
    expect(eventDurationDays({ eventDate: '2026-05-20', endDate: '2026-05-18' })).toBeNull();
  });
});

describe('medication parsing', () => {
  it('splits composer summaries into entries and drug names', () => {
    const medication = '阿莫西林 5ml 每日3次 7天；布洛芬 按需';
    expect(splitMedicationEntries(medication)).toEqual(['阿莫西林 5ml 每日3次 7天', '布洛芬 按需']);
    expect(medicationNames(medication)).toEqual(['阿莫西林', '布洛芬']);
    expect(medicationNames('生理盐水喷雾、生理盐水喷雾')).toEqual(['生理盐水喷雾']);
    expect(splitMedicationEntries(null)).toEqual([]);
  });

  it('tallies each drug once per event, most frequent first', () => {
    const tallies = summarizeMedications([
      makeEvent({ eventId: 'a', medication: '布洛芬 5ml；阿莫西林 5ml' }),
      makeEvent({ eventId: 'b', medication: '阿莫西林 10ml；阿莫西林 5ml' }),
      makeEvent({ eventId: 'c', medication: null }),
    ]);
    expect(tallies).toEqual([
      { name: '阿莫西林', count: 2 },
      { name: '布洛芬', count: 1 },
    ]);
  });
});

describe('visit reasons', () => {
  it('drops the composer symptom suffix and skips lab reports', () => {
    expect(visitReason(makeEvent({ title: '手足口病 — 发烧、皮疹' }))).toBe('手足口病');
    expect(visitReason(makeEvent({ eventType: 'lab-report', title: '检验报告' }))).toBeNull();
    expect(summarizeVisitReasons([
      makeEvent({ eventId: 'a', title: '过敏性鼻炎复诊' }),
      makeEvent({ eventId: 'b', title: '手足口病 — 发烧' }),
      makeEvent({ eventId: 'c', title: '过敏性鼻炎复诊' }),
      makeEvent({ eventId: 'd', eventType: 'lab-report', title: '检验报告' }),
    ])).toEqual([
      { name: '过敏性鼻炎复诊', count: 2 },
      { name: '手足口病', count: 1 },
    ]);
  });
});

describe('computeMedicalKpis', () => {
  const today = new Date(2026, 8, 28);

  it('counts the past year, measures from the latest end date and tallies reports', () => {
    const kpis = computeMedicalKpis([
      makeEvent({ eventId: 'a', eventDate: '2026-05-20', endDate: '2026-05-24', medication: '生理盐水喷雾' }),
      makeEvent({ eventId: 'b', eventDate: '2026-03-12', eventType: 'lab-report', title: '检验报告' }),
      makeEvent({ eventId: 'c', eventDate: '2025-09-28', medication: '生理盐水喷雾；布洛芬' }),
      makeEvent({ eventId: 'd', eventDate: '2025-09-27' }),
    ], today);
    expect(kpis).toEqual({
      recentYearCount: 3,
      daysSinceLast: 127,
      medicationKinds: 2,
      labReportCount: 1,
    });
  });

  it('never reports a negative gap for future-dated or ongoing records', () => {
    const kpis = computeMedicalKpis([
      makeEvent({ eventDate: '2026-09-20', endDate: '2026-10-05', eventType: 'hospitalization' }),
    ], today);
    expect(kpis.daysSinceLast).toBe(0);
    expect(computeMedicalKpis([], today).daysSinceLast).toBeNull();
  });
});
