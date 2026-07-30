/**
 * check-parentos-knowledge-base.ts
 * Validates YAML knowledge base integrity: unique IDs, regex patterns,
 * and generation freshness.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  validateKnowledgeSource,
  validateMilestoneThreshold,
  validateReminderExplain,
  validateReminderKind,
  validateReminderRule,
  validateReminderSourceRetired,
  validateSensitivePeriod,
} from './parentos-knowledge-base-validation.js';
import {
  knowledgeAssetSourcePaths,
  readKnowledgeAssetData,
} from './knowledge-json-asset.js';
import {
  assertCrossReferenceIntegrity,
  assertNoOrphanShards,
  assertValidKnowledgeAsset,
  loadKnowledgeAsset,
} from './knowledge-asset-kernel.js';
import { collectKnowledgeAssetGovernanceErrors } from './check-knowledge-asset-governance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO_ROOT = ROOT;
const TABLES = resolve(ROOT, 'data/structured/parentos');
const DATA_KNOWLEDGE = resolve(ROOT, 'data/knowledge');
const GEN = resolve(ROOT, 'src/shell/renderer/knowledge-base/gen');
const RUST_GEN = resolve(ROOT, 'src-tauri/src/sqlite/queries');

let errors = 0;

function fail(msg: string) {
  console.error(`  FAIL: ${msg}`);
  errors++;
}

function pass(msg: string) {
  console.log(`  PASS: ${msg}`);
}

function readTableYaml(filename: string): unknown {
  return parseYaml(readFileSync(resolve(TABLES, filename), 'utf-8'));
}

function readKnowledgeAsset(assetId: string): unknown {
  return readKnowledgeAssetData(DATA_KNOWLEDGE, assetId);
}

function sourcePath(source: KnowledgeSourceRef) {
  return source.kind === 'table'
    ? resolve(TABLES, source.file)
    : resolve(DATA_KNOWLEDGE, source.file);
}

type KnowledgeSourceRef = { kind: 'table' | 'data'; file: string };

function sourcePaths(source: KnowledgeSourceRef) {
  if (source.kind === 'data') {
    return knowledgeAssetSourcePaths(DATA_KNOWLEDGE, source.file);
  }
  return [sourcePath(source)];
}

function checkUniqueIds(source: KnowledgeSourceRef, key: string, idField: string, pattern: RegExp) {
  const file = source.file;
  console.log(`\n--- ${file} ---`);
  const data = source.kind === 'table'
    ? (readTableYaml(file) as Record<string, unknown>)
    : (readKnowledgeAsset(file) as Record<string, unknown>);
  const items = data[key] as Array<Record<string, string>>;
  if (!items) {
    fail(`Key '${key}' not found in ${file}`);
    return;
  }

  const seen = new Set<string>();
  for (const item of items) {
    const id = item[idField];
    if (!id) {
      fail(`Missing ${idField} in ${file}`);
      continue;
    }
    if (seen.has(id)) {
      fail(`Duplicate ${idField}: ${id}`);
    }
    seen.add(id);
    if (!pattern.test(id)) {
      fail(`${idField} '${id}' does not match pattern ${pattern}`);
    }
  }
  pass(`${seen.size} unique ${idField}s, all matching ${pattern}`);
}

// ── ID Uniqueness & Pattern ─────────────────────────────────

const reminderRuleShards = ['reminder-rules.yaml', 'reminder-rules-extended.yaml'];
const reminderRuleIds = new Set<string>();
for (const shard of reminderRuleShards) {
  const shardData = parseYaml(readFileSync(resolve(TABLES, shard), 'utf-8')) as { rules?: Array<{ ruleId: string }> };
  for (const rule of shardData.rules ?? []) {
    if (!rule.ruleId) {
      fail(`Missing ruleId in ${shard}`);
      continue;
    }
    if (reminderRuleIds.has(rule.ruleId)) {
      fail(`Duplicate ruleId: ${rule.ruleId}`);
    }
    reminderRuleIds.add(rule.ruleId);
    if (!/^PO-REM-[A-Z]{3,6}-[0-9]{3}$/.test(rule.ruleId)) {
      fail(`ruleId '${rule.ruleId}' does not match pattern /^PO-REM-[A-Z]{3,6}-[0-9]{3}$/`);
    }
  }
}
pass(`${reminderRuleIds.size} unique reminder ruleIds across reminder-rules shards`);
checkUniqueIds({ kind: 'data', file: 'milestone-catalog' }, 'milestones', 'milestoneId', /^PO-MS-[A-Z]{3,5}-[0-9]{3}$/);
checkUniqueIds({ kind: 'data', file: 'sensitive-periods' }, 'periods', 'periodId', /^PO-SP-[A-Z]{3,6}-[0-9]{3}$/);

// Observation dimensions
console.log('\n--- observation-framework ---');
const obsData = readKnowledgeAsset('observation-framework') as { dimensions?: Array<{ dimensionId: string }> };

if (obsData.dimensions) {
  const dimIds = new Set<string>();
  for (const dim of obsData.dimensions) {
    if (dimIds.has(dim.dimensionId)) {
      fail(`Duplicate dimensionId: ${dim.dimensionId}`);
    }
    dimIds.add(dim.dimensionId);
  }
  pass(`${dimIds.size} unique dimensionIds`);
} else {
  pass('No dimensions array (may use frameworkMapping.layers only)');
}

// ── Generated File Freshness ────────────────────────────────

console.log('\n--- data/structured/parentos/reminder-rules.yaml constraints ---');
const reminderData = parseYaml(
  readFileSync(resolve(TABLES, 'reminder-rules.yaml'), 'utf-8'),
) as {
  rules?: Array<{
    ruleId: string;
    category: string;
    kind?: string;
    actionType?: string;
    triggerAge: { startMonths: number; endMonths: number };
    triggerCondition?: unknown;
    explain?: unknown;
    source?: unknown;
  }>;
};
const reminderExtendedData = parseYaml(
  readFileSync(resolve(TABLES, 'reminder-rules-extended.yaml'), 'utf-8'),
) as typeof reminderData;

interface HealthMetric {
  metricId: string;
  captureProtocolIds?: string[];
  evaluationPolicyRef?: string;
}

interface HealthCaptureProtocol {
  protocolId: string;
  metricIds?: string[];
  requiredMetricIds?: string[];
  optionalMetricIds?: string[];
  derivedMetricIds?: string[];
  storageTarget?: string;
}

interface ReminderCaptureTarget {
  ruleId: string;
  actionType: string;
  captureProtocolId: string;
  targetMetricIds?: string[];
}

interface HealthEvaluationPolicy {
  policyId: string;
  appliesTo?: string[];
  trendThresholds?: Array<{
    thresholdId?: string;
    metricIds?: string[];
    windowMonths?: number;
    operator?: string;
    value?: number;
    unit?: string;
    status?: string;
    reasonCode?: string;
    boundary?: string;
  }>;
  outputRules?: Array<{ status?: string; when?: string }>;
}

for (const rule of [...(reminderData.rules ?? []), ...(reminderExtendedData.rules ?? [])]) {
  for (const issue of validateReminderRule(rule)) {
    fail(issue);
  }
  for (const issue of validateReminderKind(rule)) {
    fail(issue);
  }
  for (const issue of validateReminderExplain(rule)) {
    fail(issue);
  }
  for (const issue of validateReminderSourceRetired(rule)) {
    fail(issue);
  }
}
pass(`Validated reminder rule constraints for ${reminderData.rules?.length ?? 0} rules`);

console.log('\n--- health capture authority constraints ---');
const healthMetricData = parseYaml(
  readFileSync(resolve(TABLES, 'health-metric-registry.yaml'), 'utf-8'),
) as { metrics?: HealthMetric[] };
const healthProtocolData = parseYaml(
  readFileSync(resolve(TABLES, 'health-capture-protocols.yaml'), 'utf-8'),
) as { protocols?: HealthCaptureProtocol[] };
const reminderTargetData = parseYaml(
  readFileSync(resolve(TABLES, 'reminder-capture-targets.yaml'), 'utf-8'),
) as { targets?: ReminderCaptureTarget[] };
const healthEvaluationData = parseYaml(
  readFileSync(resolve(TABLES, 'health-evaluation-rules.yaml'), 'utf-8'),
) as { status_taxonomy?: Array<{ status?: string }>; policies?: HealthEvaluationPolicy[] };

const healthMetricIds = new Set<string>();
for (const metric of healthMetricData.metrics ?? []) {
  if (!metric.metricId) {
    fail('data/structured/parentos/health-metric-registry.yaml metric is missing metricId');
    continue;
  }
  if (healthMetricIds.has(metric.metricId)) {
    fail(`Duplicate health metricId: ${metric.metricId}`);
  }
  healthMetricIds.add(metric.metricId);
}

const healthProtocolById = new Map<string, HealthCaptureProtocol>();
for (const protocol of healthProtocolData.protocols ?? []) {
  if (!protocol.protocolId) {
    fail('data/structured/parentos/health-capture-protocols.yaml protocol is missing protocolId');
    continue;
  }
  if (healthProtocolById.has(protocol.protocolId)) {
    fail(`Duplicate health capture protocolId: ${protocol.protocolId}`);
  }
  healthProtocolById.set(protocol.protocolId, protocol);
  const referencedMetricIds = [
    ...(protocol.metricIds ?? []),
    ...(protocol.requiredMetricIds ?? []),
    ...(protocol.optionalMetricIds ?? []),
    ...(protocol.derivedMetricIds ?? []),
  ];
  for (const metricId of referencedMetricIds) {
    if (!healthMetricIds.has(metricId)) {
      fail(`data/structured/parentos/health-capture-protocols.yaml protocol ${protocol.protocolId} references unknown metricId ${metricId}`);
    }
  }
  if (protocol.storageTarget !== 'health_record_event' && protocol.storageTarget !== 'retained_table') {
    fail(`data/structured/parentos/health-capture-protocols.yaml protocol ${protocol.protocolId} has invalid storageTarget ${protocol.storageTarget}`);
  }
}

for (const metric of healthMetricData.metrics ?? []) {
  for (const protocolId of metric.captureProtocolIds ?? []) {
    if (!healthProtocolById.has(protocolId)) {
      fail(`data/structured/parentos/health-metric-registry.yaml metric ${metric.metricId} references unknown captureProtocolId ${protocolId}`);
    }
  }
}

const healthEvaluationPolicyIds = new Set<string>();
const healthEvaluationStatuses = new Set((healthEvaluationData.status_taxonomy ?? []).map((row) => row.status).filter(Boolean));
for (const policy of healthEvaluationData.policies ?? []) {
  if (!policy.policyId) {
    fail('data/structured/parentos/health-evaluation-rules.yaml policy is missing policyId');
    continue;
  }
  if (healthEvaluationPolicyIds.has(policy.policyId)) {
    fail(`Duplicate health evaluation policyId: ${policy.policyId}`);
  }
  healthEvaluationPolicyIds.add(policy.policyId);
  for (const metricId of policy.appliesTo ?? []) {
    if (!healthMetricIds.has(metricId)) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} references unknown metricId ${metricId}`);
    }
  }
  const trendThresholdIds = new Set<string>();
  for (const threshold of policy.trendThresholds ?? []) {
    if (!threshold.thresholdId) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} trendThreshold is missing thresholdId`);
      continue;
    }
    if (trendThresholdIds.has(threshold.thresholdId)) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} duplicate trendThresholdId ${threshold.thresholdId}`);
    }
    trendThresholdIds.add(threshold.thresholdId);
    if (!Array.isArray(threshold.metricIds) || threshold.metricIds.length === 0) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} must name metricIds`);
    }
    for (const metricId of threshold.metricIds ?? []) {
      if (!healthMetricIds.has(metricId)) {
        fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} references unknown metricId ${metricId}`);
      }
      if (!(policy.appliesTo ?? []).includes(metricId)) {
        fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} metricId ${metricId} is outside policy appliesTo`);
      }
    }
    if (typeof threshold.windowMonths !== 'number' || threshold.windowMonths <= 0) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} windowMonths must be a positive number`);
    }
    if (!['>=', '>', '<=', '<'].includes(threshold.operator ?? '')) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} operator must be one of >=, >, <=, <`);
    }
    if (typeof threshold.value !== 'number' || !Number.isFinite(threshold.value)) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} value must be a finite number`);
    }
    if (!threshold.unit) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} unit is required`);
    }
    if (!threshold.status || !healthEvaluationStatuses.has(threshold.status)) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} status must resolve in status_taxonomy`);
    }
    if (!threshold.reasonCode) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} reasonCode is required`);
    }
    if (!threshold.boundary) {
      fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} threshold ${threshold.thresholdId} boundary is required`);
    }
  }
  for (const outputRule of policy.outputRules ?? []) {
    const when = outputRule.when ?? '';
    if (/\bdelta\b/iu.test(when)) {
      const match = when.match(/trendThresholds\.thresholdId=([a-z0-9.-]+)/u);
      if (!match) {
        fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} trend output rule must reference trendThresholds.thresholdId`);
      } else if (!trendThresholdIds.has(match[1])) {
        fail(`data/structured/parentos/health-evaluation-rules.yaml policy ${policy.policyId} trend output rule references unknown threshold ${match[1]}`);
      }
    }
  }
}

for (const metric of healthMetricData.metrics ?? []) {
  if (metric.evaluationPolicyRef && !healthEvaluationPolicyIds.has(metric.evaluationPolicyRef)) {
    fail(`data/structured/parentos/health-metric-registry.yaml metric ${metric.metricId} references unknown evaluationPolicyRef ${metric.evaluationPolicyRef}`);
  }
}

const recordDataRules = new Map<string, { ruleId: string; actionType?: string }>();
for (const rule of [...(reminderData.rules ?? []), ...(reminderExtendedData.rules ?? [])]) {
  if (rule.actionType === 'record_data') {
    recordDataRules.set(rule.ruleId, rule);
  }
}

const targetCountByRuleId = new Map<string, number>();
for (const target of reminderTargetData.targets ?? []) {
  if (!target.ruleId) {
    fail('data/structured/parentos/reminder-capture-targets.yaml target is missing ruleId');
    continue;
  }
  targetCountByRuleId.set(target.ruleId, (targetCountByRuleId.get(target.ruleId) ?? 0) + 1);
  const rule = recordDataRules.get(target.ruleId);
  if (!rule) {
    fail(`data/structured/parentos/reminder-capture-targets.yaml target ${target.ruleId} does not resolve to an actionType=record_data reminder rule shard`);
  }
  if (target.actionType !== 'record_data') {
    fail(`data/structured/parentos/reminder-capture-targets.yaml target ${target.ruleId} must declare actionType=record_data`);
  }
  const protocol = healthProtocolById.get(target.captureProtocolId);
  if (!protocol) {
    fail(`data/structured/parentos/reminder-capture-targets.yaml target ${target.ruleId} references unknown captureProtocolId ${target.captureProtocolId}`);
  }
  for (const metricId of target.targetMetricIds ?? []) {
    if (!healthMetricIds.has(metricId)) {
      fail(`data/structured/parentos/reminder-capture-targets.yaml target ${target.ruleId} references unknown metricId ${metricId}`);
    }
    if (protocol && !(protocol.metricIds ?? []).includes(metricId)) {
      fail(`data/structured/parentos/reminder-capture-targets.yaml target ${target.ruleId} metricId ${metricId} is not admitted by protocol ${target.captureProtocolId}`);
    }
  }
}
for (const ruleId of recordDataRules.keys()) {
  const count = targetCountByRuleId.get(ruleId) ?? 0;
  if (count !== 1) {
    fail(`actionType=record_data reminder rule ${ruleId} must have exactly one reminder-capture-target row, found ${count}`);
  }
}
pass(`Validated ${healthMetricIds.size} health metrics, ${healthProtocolById.size} capture protocols, ${healthEvaluationPolicyIds.size} evaluation policies, and ${recordDataRules.size} record_data reminder targets`);

console.log('\n--- data/structured/parentos/growth-milestone-rules.yaml constraints ---');

interface GrowthMilestoneRuleRow {
  ruleId: string;
  kind?: string;
  appliesToMetricIds?: string[];
  triggerCondition?: { evidenceWindowMonths?: number };
}

const growthMilestoneData = parseYaml(
  readFileSync(resolve(TABLES, 'growth-milestone-rules.yaml'), 'utf-8'),
) as { rules?: GrowthMilestoneRuleRow[] };

const GROWTH_MILESTONE_RULE_ID_PATTERN = /^growth-milestone-[a-z0-9-]+$/;
const GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MIN = 1;
const GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MAX = 24;
const growthMilestoneRuleIds = new Set<string>();

if (!Array.isArray(growthMilestoneData.rules) || growthMilestoneData.rules.length === 0) {
  fail('data/structured/parentos/growth-milestone-rules.yaml must declare a non-empty rules array');
}

for (const rule of growthMilestoneData.rules ?? []) {
  if (!rule.ruleId) {
    fail('data/structured/parentos/growth-milestone-rules.yaml rule is missing ruleId');
    continue;
  }
  if (!GROWTH_MILESTONE_RULE_ID_PATTERN.test(rule.ruleId)) {
    fail(`data/structured/parentos/growth-milestone-rules.yaml ruleId ${rule.ruleId} does not match ${GROWTH_MILESTONE_RULE_ID_PATTERN}`);
  }
  if (growthMilestoneRuleIds.has(rule.ruleId)) {
    fail(`Duplicate growth-milestone ruleId: ${rule.ruleId}`);
  }
  growthMilestoneRuleIds.add(rule.ruleId);
  for (const metricId of rule.appliesToMetricIds ?? []) {
    if (!healthMetricIds.has(metricId)) {
      fail(`data/structured/parentos/growth-milestone-rules.yaml rule ${rule.ruleId} references unknown metricId ${metricId}`);
    }
  }
  const evidenceWindowMonths = rule.triggerCondition?.evidenceWindowMonths;
  if (typeof evidenceWindowMonths !== 'number') {
    fail(`data/structured/parentos/growth-milestone-rules.yaml rule ${rule.ruleId} triggerCondition.evidenceWindowMonths must be a number`);
  } else if (
    evidenceWindowMonths < GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MIN ||
    evidenceWindowMonths > GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MAX
  ) {
    fail(
      `data/structured/parentos/growth-milestone-rules.yaml rule ${rule.ruleId} triggerCondition.evidenceWindowMonths ${evidenceWindowMonths} is outside admitted range [${GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MIN}, ${GROWTH_MILESTONE_EVIDENCE_WINDOW_MONTHS_MAX}]`,
    );
  }
}
pass(`Validated growth-milestone-rules constraints for ${growthMilestoneData.rules?.length ?? 0} rules`);

console.log('\n--- data/structured/parentos/reference-data-assets.yaml constraints ---');
const referenceAssetData = readTableYaml('reference-data-assets.yaml') as {
  assets?: Array<{
    assetId: string;
    path: string;
    storageModel: string;
    format: string;
    authorityClass: string;
    generatedModule?: string;
    runtimeProjectionAdmission?: string;
  }>;
};
const referenceAssetIds = new Set<string>();
const knowledgeAssetsById = new Map<string, ReturnType<typeof loadKnowledgeAsset>>();
for (const asset of referenceAssetData.assets ?? []) {
  if (!asset.assetId) {
    fail('data/structured/parentos/reference-data-assets.yaml asset is missing assetId');
    continue;
  }
  if (referenceAssetIds.has(asset.assetId)) {
    fail(`Duplicate reference data assetId: ${asset.assetId}`);
  }
  referenceAssetIds.add(asset.assetId);
  if (asset.format !== 'json') {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${asset.assetId} must use format=json`);
  }
  if (asset.storageModel !== 'directory_backed_asset') {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${asset.assetId} must use storageModel=directory_backed_asset`);
  }
  if (asset.authorityClass === 'design_asset' && asset.generatedModule && !asset.runtimeProjectionAdmission) {
    fail(`data/structured/parentos/reference-data-assets.yaml design_asset ${asset.assetId} must not declare generatedModule without runtimeProjectionAdmission`);
  }
  if (asset.path !== `data/knowledge/assets/${asset.assetId}/asset.json`) {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${asset.assetId} path must be directory-backed asset.json`);
  }
  const manifestPath = resolve(REPO_ROOT, asset.path);
  if (!existsSync(manifestPath)) {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${asset.assetId} path does not exist: ${asset.path}`);
    continue;
  }
  try {
    const knowledgeAsset = loadKnowledgeAsset({
      dataKnowledgeRoot: DATA_KNOWLEDGE,
      assetId: asset.assetId,
      manifestPath,
      registryEntry: asset,
    });
    knowledgeAssetsById.set(asset.assetId, knowledgeAsset);
    assertValidKnowledgeAsset(knowledgeAsset, { requireContractManifest: true });
    assertNoOrphanShards(knowledgeAsset);
  } catch (error) {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${asset.assetId} failed asset-kernel validation: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const [assetId, knowledgeAsset] of knowledgeAssetsById) {
  try {
    assertCrossReferenceIntegrity(knowledgeAsset, knowledgeAssetsById);
  } catch (error) {
    fail(`data/structured/parentos/reference-data-assets.yaml asset ${assetId} failed asset cross-reference validation: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const expected of [
  'growth-standards',
  'milestone-catalog',
  'sensitive-periods',
  'observation-framework',
  'ability-model',
  'ai-boundary-rules',
  'advisor-classifier',
  'pediatric-drug-catalog',
  'journal-guidance-catalog',
  'smart-alert-rules',
]) {
  if (!referenceAssetIds.has(expected)) {
    fail(`data/structured/parentos/reference-data-assets.yaml is missing required asset ${expected}`);
  }
}
pass(`Validated ${referenceAssetIds.size} reference data assets`);

console.log('\n--- knowledge asset governance ---');
for (const issue of collectKnowledgeAssetGovernanceErrors()) {
  fail(issue);
}
if (errors === 0) {
  pass('Knowledge asset governance gate passed');
}

console.log('\n--- milestone-catalog constraints ---');
const milestoneData = readKnowledgeAsset('milestone-catalog') as {
  milestones?: Array<{
    milestoneId: string;
    typicalAge: { rangeEnd: number };
    alertIfNotBy?: number;
  }>;
};

for (const milestone of milestoneData.milestones ?? []) {
  for (const issue of validateMilestoneThreshold(milestone)) {
    fail(issue);
  }
}
pass(`Validated milestone alert thresholds for ${milestoneData.milestones?.length ?? 0} milestones`);

console.log('\n--- sensitive-periods constraints ---');
const periodData = readKnowledgeAsset('sensitive-periods') as {
  periods?: Array<{
    periodId: string;
    ageRange: { startMonths: number; peakMonths: number; endMonths: number };
  }>;
};

for (const period of periodData.periods ?? []) {
  for (const issue of validateSensitivePeriod(period)) {
    fail(issue);
  }
}
pass(`Validated sensitive period ordering for ${periodData.periods?.length ?? 0} periods`);

console.log('\n--- data/structured/parentos/knowledge-source-readiness.yaml constraints ---');
const readinessData = parseYaml(
  readFileSync(resolve(TABLES, 'knowledge-source-readiness.yaml'), 'utf-8'),
) as {
  sources?: Array<{
    domain: string;
    status: string;
    lastReviewedAt: string | null;
  }>;
};

const seenDomains = new Set<string>();
for (const source of readinessData.sources ?? []) {
  for (const issue of validateKnowledgeSource(source, seenDomains)) {
    fail(issue);
  }
}
pass(`Validated knowledge-source readiness constraints for ${readinessData.sources?.length ?? 0} entries`);

console.log('\n--- runtime policy catalog constraints ---');

const aiBoundaryData = readKnowledgeAsset('ai-boundary-rules') as {
  bannedTermRules?: Array<{ id?: string; label?: string; pattern?: string; flags?: string }>;
  fallback?: { message?: string };
};
const aiBoundaryIds = new Set<string>();
const aiBoundaryLabels = new Set<string>();
for (const rule of aiBoundaryData.bannedTermRules ?? []) {
  if (!rule.id) {
    fail('ai-boundary-rules asset bannedTermRule is missing id');
    continue;
  }
  if (aiBoundaryIds.has(rule.id)) {
    fail(`Duplicate ai-boundary bannedTermRule id: ${rule.id}`);
  }
  aiBoundaryIds.add(rule.id);
  if (!rule.label) {
    fail(`ai-boundary-rules asset rule ${rule.id} is missing label`);
  } else if (aiBoundaryLabels.has(rule.label)) {
    fail(`Duplicate ai-boundary bannedTermRule label: ${rule.label}`);
  } else {
    aiBoundaryLabels.add(rule.label);
  }
  if (!rule.pattern) {
    fail(`ai-boundary-rules asset rule ${rule.id} is missing pattern`);
  } else {
    try {
      new RegExp(rule.pattern, rule.flags ?? '');
    } catch (error) {
      fail(`ai-boundary-rules asset rule ${rule.id} has invalid pattern: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
if (!aiBoundaryData.fallback?.message) {
  fail('ai-boundary-rules asset fallback.message is required');
}

const advisorClassifierData = readKnowledgeAsset('advisor-classifier') as {
  domainKeywords?: Array<{ domain?: string; keywords?: string[] }>;
  genericRuntime?: { phraseIncludes?: string[]; exactGreetings?: string[]; compactPunctuationPattern?: string };
};
const readinessDomains = new Set((readinessData.sources ?? []).map((source) => source.domain));
const advisorDomains = new Set<string>();
for (const row of advisorClassifierData.domainKeywords ?? []) {
  if (!row.domain) {
    fail('advisor-classifier asset domainKeywords row is missing domain');
    continue;
  }
  if (advisorDomains.has(row.domain)) {
    fail(`Duplicate advisor-classifier domain: ${row.domain}`);
  }
  advisorDomains.add(row.domain);
  if (!readinessDomains.has(row.domain)) {
    fail(`advisor-classifier asset domain ${row.domain} does not resolve in data/structured/parentos/knowledge-source-readiness.yaml`);
  }
  if (!Array.isArray(row.keywords) || row.keywords.length === 0) {
    fail(`advisor-classifier asset domain ${row.domain} must declare at least one keyword`);
  }
}
if (!Array.isArray(advisorClassifierData.genericRuntime?.phraseIncludes) || advisorClassifierData.genericRuntime.phraseIncludes.length === 0) {
  fail('advisor-classifier asset genericRuntime.phraseIncludes must be non-empty');
}
if (!Array.isArray(advisorClassifierData.genericRuntime?.exactGreetings) || advisorClassifierData.genericRuntime.exactGreetings.length === 0) {
  fail('advisor-classifier asset genericRuntime.exactGreetings must be non-empty');
}
try {
  new RegExp(advisorClassifierData.genericRuntime?.compactPunctuationPattern ?? '');
} catch (error) {
  fail(`advisor-classifier asset genericRuntime.compactPunctuationPattern is invalid: ${error instanceof Error ? error.message : String(error)}`);
}

const pediatricDrugData = readKnowledgeAsset('pediatric-drug-catalog') as {
  drugs?: Array<{ id?: string; name?: string; unit?: string; frequency?: string; py?: string }>;
};
const pediatricDrugIds = new Set<string>();
for (const drug of pediatricDrugData.drugs ?? []) {
  if (!drug.id) {
    fail('pediatric-drug-catalog asset drug is missing id');
    continue;
  }
  if (pediatricDrugIds.has(drug.id)) {
    fail(`Duplicate pediatric drug id: ${drug.id}`);
  }
  pediatricDrugIds.add(drug.id);
  if (!/^[a-z0-9-]+$/.test(drug.id)) {
    fail(`pediatric-drug-catalog asset drug id ${drug.id} must be kebab-case`);
  }
  for (const field of ['name', 'unit', 'frequency', 'py'] as const) {
    if (!drug[field]) {
      fail(`pediatric-drug-catalog asset drug ${drug.id} is missing ${field}`);
    }
  }
}

const journalGuidanceData = readKnowledgeAsset('journal-guidance-catalog') as {
  guidedPrompts?: Array<{ ruleId?: string; prompts?: string[] }>;
  guidedPromptFallback?: { observedChangeTemplate?: string; responseEffect?: string };
  observationNudges?: Array<{ dimensionId?: string; variants?: string[] }>;
  observationNudgeFallback?: { template?: string };
};
const guidedPromptRuleIds = new Set<string>();
for (const row of journalGuidanceData.guidedPrompts ?? []) {
  if (!row.ruleId) {
    fail('journal-guidance-catalog asset guidedPrompts row is missing ruleId');
    continue;
  }
  if (guidedPromptRuleIds.has(row.ruleId)) {
    fail(`Duplicate journal guided prompt ruleId: ${row.ruleId}`);
  }
  guidedPromptRuleIds.add(row.ruleId);
  if (!reminderRuleIds.has(row.ruleId)) {
    fail(`journal-guidance-catalog asset guidedPrompt ${row.ruleId} does not resolve in reminder-rules shards`);
  }
  if (!Array.isArray(row.prompts) || row.prompts.length < 2 || row.prompts.length > 3) {
    fail(`journal-guidance-catalog asset guidedPrompt ${row.ruleId} must contain 2 or 3 prompts`);
  }
  for (const prompt of row.prompts ?? []) {
    if (!prompt.trim()) {
      fail(`journal-guidance-catalog asset guidedPrompt ${row.ruleId} contains blank prompt`);
    }
  }
}
if (!journalGuidanceData.guidedPromptFallback?.observedChangeTemplate || !journalGuidanceData.guidedPromptFallback.responseEffect) {
  fail('journal-guidance-catalog asset guidedPromptFallback must declare observedChangeTemplate and responseEffect');
}
const observationDimensionIds = new Set((obsData.dimensions ?? []).map((dimension) => dimension.dimensionId));
const nudgeDimensionIds = new Set<string>();
for (const row of journalGuidanceData.observationNudges ?? []) {
  if (!row.dimensionId) {
    fail('journal-guidance-catalog asset observationNudges row is missing dimensionId');
    continue;
  }
  if (nudgeDimensionIds.has(row.dimensionId)) {
    fail(`Duplicate observation nudge dimensionId: ${row.dimensionId}`);
  }
  nudgeDimensionIds.add(row.dimensionId);
  if (!observationDimensionIds.has(row.dimensionId)) {
    fail(`journal-guidance-catalog asset observation nudge ${row.dimensionId} does not resolve in observation-framework`);
  }
  if (!Array.isArray(row.variants) || row.variants.length !== 2) {
    fail(`journal-guidance-catalog asset observation nudge ${row.dimensionId} must contain exactly 2 variants`);
  }
}
if (!journalGuidanceData.observationNudgeFallback?.template) {
  fail('journal-guidance-catalog asset observationNudgeFallback.template is required');
}

const smartAlertData = readKnowledgeAsset('smart-alert-rules') as {
  allergenNormalization?: Array<{ match?: string; tags?: string[] }>;
  reminderTagAllergenMap?: Array<{ ruleTag?: string; allergenTags?: string[] }>;
  chronicConditionDetectors?: Array<{ conditionId?: string; sourceField?: string; keywords?: string[] }>;
  allergyFollowupTemplates?: Array<{ templateId?: string; condition?: string; offsetDays?: number; priority?: string; source?: string }>;
  dentalFollowups?: Array<{ eventType?: string; months?: number }>;
  seasonalAlerts?: Array<{ id?: string; activeMonths?: number[]; requiredConditions?: string[]; priority?: string }>;
  medicalAlerts?: {
    frequentVisits?: { thresholdCount?: number; windowDays?: number };
    repeatedDiagnosis?: { thresholdCount?: number };
    severeWithoutFollowup?: { followupWindowDays?: number; recentWindowDays?: number };
    longTermMedication?: { thresholdCount?: number };
  };
};
const normalizedAllergenMatches = new Set<string>();
for (const row of smartAlertData.allergenNormalization ?? []) {
  if (!row.match) {
    fail('smart-alert-rules asset allergenNormalization row is missing match');
    continue;
  }
  const normalizedMatch = row.match.toLowerCase();
  if (normalizedAllergenMatches.has(normalizedMatch)) {
    fail(`Duplicate smart-alert allergenNormalization match: ${row.match}`);
  }
  normalizedAllergenMatches.add(normalizedMatch);
  if (!Array.isArray(row.tags) || row.tags.length === 0) {
    fail(`smart-alert-rules asset allergenNormalization ${row.match} must declare tags`);
  }
}
const reminderTagMapIds = new Set<string>();
for (const row of smartAlertData.reminderTagAllergenMap ?? []) {
  if (!row.ruleTag) {
    fail('smart-alert-rules asset reminderTagAllergenMap row is missing ruleTag');
    continue;
  }
  if (reminderTagMapIds.has(row.ruleTag)) {
    fail(`Duplicate smart-alert reminderTagAllergenMap ruleTag: ${row.ruleTag}`);
  }
  reminderTagMapIds.add(row.ruleTag);
  if (!Array.isArray(row.allergenTags) || row.allergenTags.length === 0) {
    fail(`smart-alert-rules asset reminderTagAllergenMap ${row.ruleTag} must declare allergenTags`);
  }
}
for (const detector of smartAlertData.chronicConditionDetectors ?? []) {
  if (!detector.conditionId) {
    fail('smart-alert-rules asset chronicConditionDetectors row is missing conditionId');
  }
  if (!['allergen', 'notes'].includes(detector.sourceField ?? '')) {
    fail(`smart-alert-rules asset chronicConditionDetector ${detector.conditionId ?? '<missing>'} has invalid sourceField`);
  }
  if (!Array.isArray(detector.keywords) || detector.keywords.length === 0) {
    fail(`smart-alert-rules asset chronicConditionDetector ${detector.conditionId ?? '<missing>'} must declare keywords`);
  }
}
const followupTemplateIds = new Set<string>();
for (const template of smartAlertData.allergyFollowupTemplates ?? []) {
  if (!template.templateId) {
    fail('smart-alert-rules asset allergyFollowupTemplates row is missing templateId');
    continue;
  }
  if (followupTemplateIds.has(template.templateId)) {
    fail(`Duplicate smart-alert allergyFollowup templateId: ${template.templateId}`);
  }
  followupTemplateIds.add(template.templateId);
  if (typeof template.offsetDays !== 'number' || template.offsetDays <= 0) {
    fail(`smart-alert-rules asset allergyFollowup template ${template.templateId} must have positive offsetDays`);
  }
  if (!['P0', 'P1', 'P2'].includes(template.priority ?? '')) {
    fail(`smart-alert-rules asset allergyFollowup template ${template.templateId} has invalid priority`);
  }
  if (template.source !== 'allergy-followup') {
    fail(`smart-alert-rules asset allergyFollowup template ${template.templateId} must use source=allergy-followup`);
  }
}
const dentalEventTypes = new Set<string>();
for (const row of smartAlertData.dentalFollowups ?? []) {
  if (!row.eventType) {
    fail('smart-alert-rules asset dentalFollowups row is missing eventType');
    continue;
  }
  if (dentalEventTypes.has(row.eventType)) {
    fail(`Duplicate smart-alert dentalFollowup eventType: ${row.eventType}`);
  }
  dentalEventTypes.add(row.eventType);
  if (typeof row.months !== 'number' || row.months <= 0) {
    fail(`smart-alert-rules asset dentalFollowup ${row.eventType} must have positive months`);
  }
}
const seasonalAlertIds = new Set<string>();
for (const alert of smartAlertData.seasonalAlerts ?? []) {
  if (!alert.id) {
    fail('smart-alert-rules asset seasonalAlerts row is missing id');
    continue;
  }
  if (seasonalAlertIds.has(alert.id)) {
    fail(`Duplicate smart-alert seasonalAlert id: ${alert.id}`);
  }
  seasonalAlertIds.add(alert.id);
  for (const month of alert.activeMonths ?? []) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      fail(`smart-alert-rules asset seasonalAlert ${alert.id} has invalid activeMonth ${month}`);
    }
  }
  if (!Array.isArray(alert.requiredConditions) || alert.requiredConditions.length === 0) {
    fail(`smart-alert-rules asset seasonalAlert ${alert.id} must declare requiredConditions`);
  }
  if (!['P1', 'P2'].includes(alert.priority ?? '')) {
    fail(`smart-alert-rules asset seasonalAlert ${alert.id} has invalid priority`);
  }
}
const positiveIntegerChecks: Array<[string, number | undefined]> = [
  ['medicalAlerts.frequentVisits.thresholdCount', smartAlertData.medicalAlerts?.frequentVisits?.thresholdCount],
  ['medicalAlerts.frequentVisits.windowDays', smartAlertData.medicalAlerts?.frequentVisits?.windowDays],
  ['medicalAlerts.repeatedDiagnosis.thresholdCount', smartAlertData.medicalAlerts?.repeatedDiagnosis?.thresholdCount],
  ['medicalAlerts.severeWithoutFollowup.followupWindowDays', smartAlertData.medicalAlerts?.severeWithoutFollowup?.followupWindowDays],
  ['medicalAlerts.severeWithoutFollowup.recentWindowDays', smartAlertData.medicalAlerts?.severeWithoutFollowup?.recentWindowDays],
  ['medicalAlerts.longTermMedication.thresholdCount', smartAlertData.medicalAlerts?.longTermMedication?.thresholdCount],
];
for (const [field, value] of positiveIntegerChecks) {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    fail(`smart-alert-rules asset ${field} must be a positive integer`);
  }
}

pass(`Validated runtime policy catalogs: ${aiBoundaryIds.size} AI boundary rules, ${advisorDomains.size} advisor domains, ${pediatricDrugIds.size} pediatric drugs, ${guidedPromptRuleIds.size} journal prompt rows, ${seasonalAlertIds.size} seasonal alerts`);

console.log('\n--- growth-standards constraints ---');
const growthData = readKnowledgeAsset('growth-standards') as {
  measurementTypes?: Array<{
    typeId: string;
    ageRange: { startMonths: number; endMonths: number };
    referenceCoverage?: { startMonths: number; endMonths: number };
  }>;
};

for (const measurement of growthData.measurementTypes ?? []) {
  const coverage = measurement.referenceCoverage;
  if (!coverage) {
    continue;
  }

  if (coverage.startMonths < measurement.ageRange.startMonths) {
    fail(`${measurement.typeId}.referenceCoverage.startMonths must be >= ageRange.startMonths`);
  }

  if (coverage.endMonths > measurement.ageRange.endMonths) {
    fail(`${measurement.typeId}.referenceCoverage.endMonths must be <= ageRange.endMonths`);
  }

  if (coverage.startMonths > coverage.endMonths) {
    fail(`${measurement.typeId}.referenceCoverage startMonths must be <= endMonths`);
  }
}
pass(`Validated growth reference coverage for ${growthData.measurementTypes?.length ?? 0} measurement types`);

console.log('\n--- Generation Freshness ---');

const genFiles: Array<{ source: KnowledgeSourceRef; gen: string; root?: string }> = [
  { source: { kind: 'table', file: 'reminder-rules.yaml' }, gen: 'reminder-rules.gen.ts' },
  { source: { kind: 'table', file: 'reminder-rules-extended.yaml' }, gen: 'reminder-rules.gen.ts' },
  { source: { kind: 'table', file: 'reminder-rules.yaml' }, gen: 'vaccine-reminder-rules.gen.rs', root: RUST_GEN },
  { source: { kind: 'table', file: 'reminder-rules-extended.yaml' }, gen: 'vaccine-reminder-rules.gen.rs', root: RUST_GEN },
  { source: { kind: 'data', file: 'milestone-catalog' }, gen: 'milestone-catalog.gen.ts' },
  { source: { kind: 'data', file: 'sensitive-periods' }, gen: 'sensitive-periods.gen.ts' },
  { source: { kind: 'data', file: 'observation-framework' }, gen: 'observation-framework.gen.ts' },
  { source: { kind: 'data', file: 'observation-framework' }, gen: 'observation-vocabulary.gen.rs', root: RUST_GEN },
  { source: { kind: 'data', file: 'growth-standards' }, gen: 'growth-standards.gen.ts' },
  { source: { kind: 'table', file: 'nurture-modes.yaml' }, gen: 'nurture-modes.gen.ts' },
  { source: { kind: 'table', file: 'knowledge-source-readiness.yaml' }, gen: 'knowledge-source-readiness.gen.ts' },
  { source: { kind: 'data', file: 'growth-standards' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'milestone-catalog' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'sensitive-periods' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'observation-framework' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'ability-model' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'ai-boundary-rules' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'advisor-classifier' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'pediatric-drug-catalog' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'journal-guidance-catalog' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'data', file: 'smart-alert-rules' }, gen: 'knowledge-asset-fingerprints.gen.ts' },
  { source: { kind: 'table', file: 'health-metric-registry.yaml' }, gen: 'health-record.gen.ts' },
  { source: { kind: 'table', file: 'health-evaluation-rules.yaml' }, gen: 'health-record.gen.ts' },
  { source: { kind: 'table', file: 'health-capture-protocols.yaml' }, gen: 'health-record.gen.ts' },
  { source: { kind: 'table', file: 'reminder-capture-targets.yaml' }, gen: 'health-record.gen.ts' },
  { source: { kind: 'table', file: 'growth-milestone-rules.yaml' }, gen: 'growth-milestone-rules.gen.ts' },
  { source: { kind: 'data', file: 'ai-boundary-rules' }, gen: 'ai-boundary.gen.ts' },
  { source: { kind: 'data', file: 'advisor-classifier' }, gen: 'advisor-classifier.gen.ts' },
  { source: { kind: 'data', file: 'pediatric-drug-catalog' }, gen: 'pediatric-drug-catalog.gen.ts' },
  { source: { kind: 'data', file: 'journal-guidance-catalog' }, gen: 'journal-guidance.gen.ts' },
  { source: { kind: 'data', file: 'smart-alert-rules' }, gen: 'smart-alert-rules.gen.ts' },
];

for (const { source, gen, root } of genFiles) {
  try {
    const sourceMtime = Math.max(...sourcePaths(source).map((path) => statSync(path).mtimeMs));
    const genMtime = statSync(resolve(root ?? GEN, gen)).mtimeMs;
    if (sourceMtime > genMtime) {
      fail(`${gen} is stale (${source.file} modified after generation). Run pnpm generate:knowledge-base`);
    } else {
      pass(`${gen} is up to date`);
    }
  } catch {
    fail(`${gen} does not exist. Run pnpm generate:knowledge-base`);
  }
}

// ── Result ──────────────────────────────────────────────────

console.log(`\n${errors === 0 ? 'All checks passed.' : `${errors} error(s) found.`}\n`);
process.exit(errors > 0 ? 1 : 0);
