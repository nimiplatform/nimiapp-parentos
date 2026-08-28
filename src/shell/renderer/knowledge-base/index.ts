// Knowledge base — re-exports all generated modules
// Run `pnpm generate:knowledge-base` to regenerate from YAML sources.

export { REMINDER_RULES, REMINDER_DOMAINS, REMINDER_KINDS } from './gen/reminder-rules.gen.js';
export type {
  ReminderRule,
  ReminderDomain,
  ReminderCategory,
  ReminderPriority,
  ReminderVisibility,
  ReminderKind,
  ReminderExplain,
  ReminderExplainSource,
  ActionType,
} from './gen/reminder-rules.gen.js';

export { MILESTONE_CATALOG, MILESTONE_DOMAINS } from './gen/milestone-catalog.gen.js';
export type { Milestone, MilestoneDomain } from './gen/milestone-catalog.gen.js';

export { SENSITIVE_PERIODS } from './gen/sensitive-periods.gen.js';
export type { SensitivePeriod } from './gen/sensitive-periods.gen.js';

export { OBSERVATION_MODES, OBSERVATION_DIMENSIONS, FRAMEWORK_LAYERS, DIMENSION_IDS } from './gen/observation-framework.gen.js';
export type { ObservationMode, ObservationModeId, ObservationDimension, FrameworkLayer } from './gen/observation-framework.gen.js';

export { GROWTH_STANDARDS, GROWTH_TYPE_IDS, REFERENCE_RANGES } from './gen/growth-standards.gen.js';
export type { GrowthStandard, GrowthTypeId, CurveType } from './gen/growth-standards.gen.js';

export { NURTURE_MODES, NURTURE_MODE_IDS } from './gen/nurture-modes.gen.js';
export type { NurtureModeConfig, NurtureModeId } from './gen/nurture-modes.gen.js';

export { KNOWLEDGE_SOURCES, REVIEWED_DOMAINS, NEEDS_REVIEW_DOMAINS } from './gen/knowledge-source-readiness.gen.js';
export type { KnowledgeSource, KnowledgeSourceStatus } from './gen/knowledge-source-readiness.gen.js';

export { DASHBOARD_TASK_CATALOG } from './gen/dashboard-task-catalog.gen.js';
export type {
  DashboardTaskCatalogRow,
  DashboardTaskFamily,
  DashboardTaskCadencePolicy,
  DashboardTaskBiologicalAnchor,
  DashboardTaskSlotPreference,
  DashboardTaskDispersionWindow,
  DashboardTaskDecayStrategy,
} from './gen/dashboard-task-catalog.gen.js';

export { KNOWLEDGE_ASSET_PROJECTION_FINGERPRINTS } from './gen/knowledge-asset-fingerprints.gen.js';
export type { KnowledgeAssetProjectionFingerprint } from './gen/knowledge-asset-fingerprints.gen.js';

export { GROWTH_MILESTONE_RULES, GROWTH_MILESTONE_RULE_IDS } from './gen/growth-milestone-rules.gen.js';
export type {
  GrowthMilestoneRule,
  GrowthMilestoneRuleId,
  GrowthMilestoneRuleKind,
  GrowthMilestoneTriggerCondition,
  GrowthMilestoneThresholdCrossedTrigger,
  GrowthMilestonePercentileShiftTrigger,
  GrowthMilestoneRelativeChangeTrigger,
} from './gen/growth-milestone-rules.gen.js';

export {
  HEALTH_METRIC_GROUPS,
  HEALTH_METRICS,
  HEALTH_STATUS_TAXONOMY,
  HEALTH_EVALUATION_POLICIES,
  HEALTH_CAPTURE_PROTOCOLS,
  HEALTH_REMINDER_CAPTURE_TARGETS,
  HEALTH_METRIC_IDS,
  HEALTH_CAPTURE_PROTOCOL_IDS,
  HEALTH_EVALUATION_POLICY_IDS,
  HEALTH_RECORD_DATA_RULE_IDS,
  FITNESS_STANDARD_TABLES,
} from './gen/health-record.gen.js';
export type {
  HealthMetricGroup,
  HealthMetricGroupId,
  HealthMetricDefinition,
  HealthMetricId,
  HealthApplicableAgeRange,
  HealthApplicableSex,
  HealthValueShape,
  HealthValueCardinality,
  HealthRecordKind,
  HealthSourceSupport,
  HealthSafetyClass,
  HealthStatusTaxonomyEntry,
  HealthEvaluationStatus,
  HealthStatusColorAlias,
  HealthEvaluationOutputRule,
  HealthEvaluationPolicy,
  HealthEvaluationPolicyId,
  HealthCaptureProtocol,
  HealthCaptureProtocolId,
  HealthCaptureMode,
  HealthStorageTarget,
  HealthReminderCaptureTarget,
  HealthRecordDataRuleId,
  HealthDateDefaultPolicy,
  FitnessStandardTier,
  FitnessStandardDirection,
  FitnessStandardBand,
  FitnessStandardMetricThresholds,
  FitnessStandardTable,
} from './gen/health-record.gen.js';

export {
  AI_BOUNDARY_BANNED_TERM_RULES,
  AI_BOUNDARY_FALLBACK_MESSAGE,
} from './gen/ai-boundary.gen.js';
export type { AiBoundaryBannedTermRule } from './gen/ai-boundary.gen.js';

export {
  ADVISOR_DOMAIN_KEYWORDS,
  ADVISOR_GENERIC_RUNTIME,
} from './gen/advisor-classifier.gen.js';
export type {
  AdvisorClassifierDomain,
  AdvisorDomainKeyword,
  AdvisorGenericRuntimeClassifier,
} from './gen/advisor-classifier.gen.js';

export { PEDIATRIC_DRUGS } from './gen/pediatric-drug-catalog.gen.js';
export type { PediatricDrug } from './gen/pediatric-drug-catalog.gen.js';

export {
  JOURNAL_GUIDED_PROMPTS,
  JOURNAL_GUIDED_PROMPT_FALLBACK,
  OBSERVATION_NUDGE_COPY,
  OBSERVATION_NUDGE_FALLBACK,
} from './gen/journal-guidance.gen.js';
export type {
  JournalGuidedPrompt,
  JournalGuidedPromptFallback,
  ObservationNudgeCopy,
  ObservationNudgeFallback,
} from './gen/journal-guidance.gen.js';

export {
  ALLERGEN_NORMALIZATION_RULES,
  REMINDER_TAG_ALLERGEN_RULES,
  CHRONIC_CONDITION_DETECTORS,
  ALLERGY_COLLISION_MESSAGES,
  ALLERGY_FOLLOWUP_SYMPTOM_GROUPS,
  ALLERGY_FOLLOWUP_TEMPLATES,
  DENTAL_FOLLOWUP_RULES,
  DENTAL_FOLLOWUP_DESCRIPTION_TEMPLATE,
  SEASONAL_ALERT_RULES,
  SMART_ALERT_MEDICAL_RULES,
} from './gen/smart-alert-rules.gen.js';
export type {
  AllergenNormalizationRule,
  ReminderTagAllergenRule,
  ChronicConditionDetector,
  AllergyCollisionMessages,
  AllergyFollowupSymptomGroups,
  AllergyFollowupTemplate,
  DentalFollowupRule,
  SeasonalAlertRule,
  MedicalAlertRule,
  SmartAlertMedicalRules,
  SmartAlertPriority,
  DynamicTaskSource,
  AllergyFollowupCondition,
} from './gen/smart-alert-rules.gen.js';
