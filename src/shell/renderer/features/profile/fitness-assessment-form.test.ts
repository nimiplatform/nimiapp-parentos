import { describe, expect, it, vi } from 'vitest';

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  insertFitnessAssessment: vi.fn(),
  replaceHealthRecordCapture: vi.fn(),
  saveHealthRecordCapture: vi.fn(),
}));

import {
  formatFitnessSeconds,
  isStandardFieldValuePlausible,
  makeEntry,
  parseFitnessTimeInput,
  parseStandardFieldValue,
  standardEntryHasMetric,
  standardEntryValuesPlausible,
} from './fitness-assessment-form.js';

describe('parseFitnessTimeInput', () => {
  it('parses plain seconds', () => {
    expect(parseFitnessTimeInput('245')).toBe(245);
    expect(parseFitnessTimeInput('95.5')).toBe(95.5);
  });

  it('parses m:ss notation', () => {
    expect(parseFitnessTimeInput('4:05')).toBe(245);
    expect(parseFitnessTimeInput('4：05')).toBe(245);
    expect(parseFitnessTimeInput('10:00')).toBe(600);
  });

  it('parses Chinese 分秒 notation', () => {
    expect(parseFitnessTimeInput('4分05秒')).toBe(245);
    expect(parseFitnessTimeInput('4分5秒')).toBe(245);
    expect(parseFitnessTimeInput('4分05')).toBe(245);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseFitnessTimeInput('')).toBeNull();
    expect(parseFitnessTimeInput('   ')).toBeNull();
    expect(parseFitnessTimeInput('abc')).toBeNull();
    expect(parseFitnessTimeInput('4分')).toBeNull();
    expect(parseFitnessTimeInput('4:75')).toBeNull();
  });
});

describe('formatFitnessSeconds', () => {
  it('formats seconds as m:ss', () => {
    expect(formatFitnessSeconds(245)).toBe('4:05');
    expect(formatFitnessSeconds(65)).toBe('1:05');
    expect(formatFitnessSeconds(45)).toBe('0:45');
    expect(formatFitnessSeconds(600)).toBe('10:00');
  });
});

describe('parseStandardFieldValue', () => {
  it('routes timed runs through the min:sec parser', () => {
    expect(parseStandardFieldValue('run800m', '4:05')).toBe(245);
    expect(parseStandardFieldValue('run1000m', '280')).toBe(280);
    expect(parseStandardFieldValue('run50x8', '1:45')).toBe(105);
  });

  it('keeps numeric parsing for the other fields', () => {
    expect(parseStandardFieldValue('run50m', '11.2')).toBe(11.2);
    expect(parseStandardFieldValue('sitUps', '32')).toBe(32);
    expect(parseStandardFieldValue('sitAndReach', '-3.5')).toBe(-3.5);
    expect(parseStandardFieldValue('run50m', '')).toBeNull();
  });
});

describe('isStandardFieldValuePlausible', () => {
  it('treats empty input as not-filled (valid)', () => {
    expect(isStandardFieldValuePlausible('run50m', '')).toBe(true);
    expect(isStandardFieldValuePlausible('vitalCapacity', '  ')).toBe(true);
  });

  it('rejects unparseable filled input', () => {
    expect(isStandardFieldValuePlausible('run50m', 'abc')).toBe(false);
    expect(isStandardFieldValuePlausible('run800m', '4分')).toBe(false);
  });

  it('enforces range boundaries inclusively', () => {
    expect(isStandardFieldValuePlausible('run50m', '5')).toBe(true);
    expect(isStandardFieldValuePlausible('run50m', '20')).toBe(true);
    expect(isStandardFieldValuePlausible('run50m', '4.9')).toBe(false);
    expect(isStandardFieldValuePlausible('run50m', '20.1')).toBe(false);
    expect(isStandardFieldValuePlausible('sitAndReach', '-30')).toBe(true);
    expect(isStandardFieldValuePlausible('sitAndReach', '-30.1')).toBe(false);
    expect(isStandardFieldValuePlausible('sitAndReach', '45')).toBe(true);
    expect(isStandardFieldValuePlausible('vitalCapacity', '200')).toBe(true);
    expect(isStandardFieldValuePlausible('vitalCapacity', '199')).toBe(false);
    expect(isStandardFieldValuePlausible('vitalCapacity', '7000')).toBe(true);
    expect(isStandardFieldValuePlausible('vitalCapacity', '7001')).toBe(false);
  });

  it('validates min:sec input against the seconds range', () => {
    expect(isStandardFieldValuePlausible('run800m', '4:05')).toBe(true);
    expect(isStandardFieldValuePlausible('run800m', '1:00')).toBe(false);
    expect(isStandardFieldValuePlausible('run800m', '10:00')).toBe(true);
    expect(isStandardFieldValuePlausible('run800m', '10:01')).toBe(false);
  });
});

describe('standard entry completeness', () => {
  it('requires at least one filled metric', () => {
    const entry = makeEntry('standard');
    expect(standardEntryHasMetric(entry)).toBe(false);
    entry.standardValues.run50m = '   ';
    expect(standardEntryHasMetric(entry)).toBe(false);
    entry.standardValues.run50m = '11.2';
    expect(standardEntryHasMetric(entry)).toBe(true);
  });

  it('counts a captured foot arch as a filled metric', () => {
    const entry = makeEntry('standard');
    entry.footArch = 'flat';
    expect(standardEntryHasMetric(entry)).toBe(true);
  });

  it('flags any filled value outside its plausible range', () => {
    const entry = makeEntry('standard');
    expect(standardEntryValuesPlausible(entry)).toBe(true);
    entry.standardValues.run50m = '11.2';
    entry.standardValues.run800m = '4:05';
    expect(standardEntryValuesPlausible(entry)).toBe(true);
    entry.standardValues.run50m = '45';
    expect(standardEntryValuesPlausible(entry)).toBe(false);
  });
});
