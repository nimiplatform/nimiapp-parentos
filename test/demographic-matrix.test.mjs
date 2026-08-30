import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../mock/demographic-matrix.json', import.meta.url);

function computeAgeMonthsAt(birthDate, atDate) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const target = new Date(`${atDate}T00:00:00Z`);
  let months = (target.getUTCFullYear() - birth.getUTCFullYear()) * 12
    + target.getUTCMonth() - birth.getUTCMonth();
  if (target.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

test('demographic matrix contains same-age male/female pairs with valid child records', async () => {
  const matrix = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const expectedCohorts = new Set([
    'infant-3m',
    'toddler-18m',
    'preschool-4y',
    'primary-7y',
    'puberty-12y',
    'adolescent-16y',
  ]);
  const cohorts = new Map();
  const childIds = new Set();
  const scenarioIds = new Set();

  assert.equal(matrix.meta.asOfDate, '2026-08-29');
  assert.equal(matrix.scenarios.length, 12);

  for (const scenario of matrix.scenarios) {
    const { child } = scenario;
    assert.match(scenario.scenarioId, /^[a-z0-9-]+$/u);
    assert.ok(!scenarioIds.has(scenario.scenarioId), `duplicate scenarioId: ${scenario.scenarioId}`);
    scenarioIds.add(scenario.scenarioId);
    assert.match(child.childId, /^[0-9A-HJKMNP-TV-Z]{26}$/u);
    assert.ok(!childIds.has(child.childId), `duplicate childId: ${child.childId}`);
    childIds.add(child.childId);
    assert.equal(child.familyId, matrix.meta.familyId);
    assert.ok(child.gender === 'male' || child.gender === 'female');
    assert.equal(
      computeAgeMonthsAt(child.birthDate, matrix.meta.asOfDate),
      scenario.expectedAgeMonths,
      `${scenario.scenarioId} age mismatch`,
    );
    assert.ok(['relaxed', 'balanced', 'advanced'].includes(child.nurtureMode));
    for (const field of ['allergies', 'medicalNotes', 'recorderProfiles']) {
      assert.doesNotThrow(() => JSON.parse(child[field]), `${scenario.scenarioId}.${field} must be JSON text`);
    }
    const sexes = cohorts.get(scenario.cohort) ?? new Set();
    sexes.add(child.gender);
    cohorts.set(scenario.cohort, sexes);
  }

  assert.deepEqual(new Set(cohorts.keys()), expectedCohorts);
  for (const [cohort, sexes] of cohorts) {
    assert.deepEqual(sexes, new Set(['male', 'female']), `${cohort} must contain a same-age sex pair`);
  }
});

test('journal fixtures use admitted observation dimensions and quick tags', async () => {
  const dimensionsDir = new URL('../data/knowledge/assets/observation-framework/dimensions/', import.meta.url);
  const dimensionFiles = await readdir(dimensionsDir);
  const dimensions = new Map();
  for (const file of dimensionFiles.filter((name) => name.endsWith('.json'))) {
    const row = JSON.parse(await readFile(new URL(file, dimensionsDir), 'utf8'));
    dimensions.set(row.dimensionId, new Set(row.quickTags));
  }
  const entries = JSON.parse(await readFile(new URL('../mock/tables/journalEntries.json', import.meta.url), 'utf8'));
  const tags = JSON.parse(await readFile(new URL('../mock/tables/journalTags.json', import.meta.url), 'utf8'));
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));
  const allowedModes = new Set(['quick_capture', 'focused_observation', 'daily_reflection', 'five_minute']);

  for (const entry of entries) {
    assert.ok(allowedModes.has(entry.observationMode), `${entry.entryId} observationMode`);
    const channels = [
      Boolean(entry.textContent?.trim()),
      Boolean(entry.voicePath?.trim()),
      entry.photoPaths ? JSON.parse(entry.photoPaths).length > 0 : false,
    ].filter(Boolean).length;
    const expectedContentType = channels > 1
      ? 'mixed'
      : entry.textContent?.trim()
        ? 'text'
        : entry.voicePath?.trim()
          ? 'voice'
          : 'photo';
    assert.equal(entry.contentType, expectedContentType, `${entry.entryId} contentType must match supplied media`);
    const selectedTags = entry.selectedTags ? JSON.parse(entry.selectedTags) : [];
    if (entry.dimensionId == null) {
      assert.deepEqual(selectedTags, [], `${entry.entryId} without a dimension must not carry observation tags`);
      continue;
    }
    const quickTags = dimensions.get(entry.dimensionId);
    assert.ok(quickTags, `${entry.entryId} has unknown dimensionId ${entry.dimensionId}`);
    for (const tag of selectedTags) {
      assert.ok(quickTags.has(tag), `${entry.entryId} has unsupported quick tag ${tag}`);
    }
  }

  for (const tag of tags) {
    const entry = entriesById.get(tag.entryId);
    assert.ok(entry, `${tag.tagId} references a missing journal entry`);
    assert.equal(tag.domain, 'observation', `${tag.tagId} must use the closed observation domain`);
    assert.ok(entry.dimensionId, `${tag.tagId} requires its journal entry to have a dimension`);
    assert.ok(dimensions.get(entry.dimensionId)?.has(tag.tag), `${tag.tagId} has unsupported tag ${tag.tag}`);
  }
});

test('allergy fixtures use the closed profile enums', async () => {
  const records = JSON.parse(await readFile(new URL('../mock/tables/allergyRecords.json', import.meta.url), 'utf8'));
  const categories = new Set(['food', 'drug', 'environmental', 'contact', 'other']);
  const severities = new Set(['mild', 'moderate', 'severe']);
  const statuses = new Set(['active', 'outgrown', 'uncertain']);

  for (const record of records) {
    assert.ok(categories.has(record.category), `${record.recordId} category`);
    assert.ok(severities.has(record.severity), `${record.recordId} severity`);
    assert.ok(statuses.has(record.status), `${record.recordId} status`);
    assert.ok(record.statusChangedAt, `${record.recordId} statusChangedAt`);
  }
  assert.deepEqual(new Set(records.map((record) => record.status)), statuses, 'fixtures must cover every allergy status');
});
