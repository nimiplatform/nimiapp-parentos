import type { AiMessageRow, ConversationRow } from './sqlite-bridge-ai.js';
import type { ChildRow } from './sqlite-bridge-family.js';
import type {
  MeasurementRow,
  MilestoneRecordRow,
  PostureAssessmentRow,
  VaccineRecordRow,
} from './sqlite-bridge-growth.js';
import type { JournalEntryRow } from './sqlite-bridge-journal.js';
import type {
  OrthodonticApplianceRow,
  OrthodonticCaseRow,
  OrthodonticCheckinRow,
  OrthodonticDashboardProjection,
  OrthodonticJourney,
  OrthodonticJourneyEntry,
  OrthodonticUnwearIntervalRow,
} from './sqlite-bridge-orthodontic.js';
import type {
  OrthodonticPhotoAttachmentRow,
  OrthodonticPhotoSessionRow,
} from './sqlite-bridge-orthodontic-photos.js';
import type {
  AllergyRecordRow,
  AttachmentRow,
  DentalRecordRow,
  FitnessAssessmentRow,
  HealthRecordEventRow,
  HealthRecordValueRow,
  MedicalEventRow,
  OutdoorRecordRow,
  SectionSummary,
  SleepRecordRow,
  TannerAssessmentRow,
} from './sqlite-bridge-records.js';
import type { CustomTodoRow, ReminderStateRow } from './sqlite-bridge-reminders.js';
import type { VisionFollowupSettings } from './sqlite-bridge-vision.js';

export interface FamilyRow {
  familyId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalTagRow {
  tagId: string;
  entryId: string;
  domain: string;
  tag: string;
  source: string;
  confidence: number | null;
  createdAt: string;
}

export interface GrowthReportRow {
  reportId: string;
  childId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  ageMonthsStart: number;
  ageMonthsEnd: number;
  content: string;
  generatedAt: string;
  createdAt: string;
}

export interface ParentOSWebState {
  version: 1;
  family: FamilyRow | null;
  children: ChildRow[];
  appSettings: Record<string, string>;
  measurements: MeasurementRow[];
  milestoneRecords: MilestoneRecordRow[];
  reminderStates: ReminderStateRow[];
  customTodos: CustomTodoRow[];
  vaccineRecords: VaccineRecordRow[];
  journalEntries: JournalEntryRow[];
  journalTags: JournalTagRow[];
  conversations: ConversationRow[];
  aiMessages: AiMessageRow[];
  growthReports: GrowthReportRow[];
  dentalRecords: DentalRecordRow[];
  attachments: AttachmentRow[];
  allergyRecords: AllergyRecordRow[];
  sleepRecords: SleepRecordRow[];
  medicalEvents: MedicalEventRow[];
  tannerAssessments: TannerAssessmentRow[];
  fitnessAssessments: FitnessAssessmentRow[];
  outdoorRecords: OutdoorRecordRow[];
  outdoorGoals: Record<string, number>;
  postureAssessments: PostureAssessmentRow[];
  healthRecordEvents: HealthRecordEventRow[];
  healthRecordValues: HealthRecordValueRow[];
  orthodonticCases: OrthodonticCaseRow[];
  orthodonticAppliances: OrthodonticApplianceRow[];
  orthodonticCheckins: OrthodonticCheckinRow[];
  orthodonticUnwearIntervals: OrthodonticUnwearIntervalRow[];
  orthodonticPhotoSessions: OrthodonticPhotoSessionRow[];
  orthodonticPhotoAttachments: OrthodonticPhotoAttachmentRow[];
  visionFollowupSettings: Record<string, VisionFollowupSettings>;
}

export const WEB_ASSET_PREFIX = 'parentos-web-asset:';

export function createEmptyParentOSWebState(): ParentOSWebState {
  return {
    version: 1,
    family: null,
    children: [],
    appSettings: {},
    measurements: [],
    milestoneRecords: [],
    reminderStates: [],
    customTodos: [],
    vaccineRecords: [],
    journalEntries: [],
    journalTags: [],
    conversations: [],
    aiMessages: [],
    growthReports: [],
    dentalRecords: [],
    attachments: [],
    allergyRecords: [],
    sleepRecords: [],
    medicalEvents: [],
    tannerAssessments: [],
    fitnessAssessments: [],
    outdoorRecords: [],
    outdoorGoals: {},
    postureAssessments: [],
    healthRecordEvents: [],
    healthRecordValues: [],
    orthodonticCases: [],
    orthodonticAppliances: [],
    orthodonticCheckins: [],
    orthodonticUnwearIntervals: [],
    orthodonticPhotoSessions: [],
    orthodonticPhotoAttachments: [],
    visionFollowupSettings: {},
  };
}

export function validateLoadedWebState(raw: unknown): ParentOSWebState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('ParentOS Web storage state must be a JSON object.');
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error(`Unsupported ParentOS Web storage version: ${String(record.version)}`);
  }
  const base = createEmptyParentOSWebState();
  return {
    ...base,
    ...(record as Partial<ParentOSWebState>),
    version: 1,
  };
}

export function collectWebAssetPathsForChild(state: ParentOSWebState, childId: string): string[] {
  const paths = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (typeof value === 'string' && value.startsWith(WEB_ASSET_PREFIX)) {
      paths.add(value.slice(WEB_ASSET_PREFIX.length));
    }
  };
  const addJsonList = (jsonText: string | null | undefined) => {
    if (!jsonText) return;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') add(item);
        }
      }
    } catch {
      // Ignore non-JSON strings during cleanup.
    }
  };
  for (const child of state.children) {
    if (child.childId === childId) add(child.avatarPath);
  }
  for (const entry of state.journalEntries) {
    if (entry.childId !== childId) continue;
    add(entry.voicePath);
    addJsonList(entry.photoPaths);
  }
  for (const item of state.milestoneRecords) {
    if (item.childId === childId) add(item.photoPath);
  }
  for (const item of state.vaccineRecords) {
    if (item.childId === childId) add(item.photoPath);
  }
  for (const item of state.dentalRecords) {
    if (item.childId === childId) add(item.photoPath);
  }
  for (const item of state.medicalEvents) {
    if (item.childId === childId) add(item.photoPath);
  }
  for (const item of state.postureAssessments) {
    if (item.childId === childId) addJsonList(item.photoPaths);
  }
  for (const item of state.attachments) {
    if (item.childId === childId) add(item.filePath);
  }
  for (const item of state.orthodonticPhotoAttachments) {
    if (item.childId === childId) add(item.filePath);
  }
  return [...paths];
}

export function collectAllHydratableAssetPaths(state: ParentOSWebState): string[] {
  const paths = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (typeof value === 'string' && value.startsWith(WEB_ASSET_PREFIX)) {
      paths.add(value.slice(WEB_ASSET_PREFIX.length));
    }
  };
  const addJsonList = (jsonText: string | null | undefined) => {
    if (!jsonText) return;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') add(item);
        }
      }
    } catch {
      // Ignore malformed JSON.
    }
  };
  for (const child of state.children) add(child.avatarPath);
  for (const entry of state.journalEntries) {
    add(entry.voicePath);
    addJsonList(entry.photoPaths);
  }
  for (const item of state.milestoneRecords) add(item.photoPath);
  for (const item of state.vaccineRecords) add(item.photoPath);
  for (const item of state.dentalRecords) add(item.photoPath);
  for (const item of state.medicalEvents) add(item.photoPath);
  for (const item of state.postureAssessments) addJsonList(item.photoPaths);
  for (const item of state.attachments) add(item.filePath);
  return [...paths];
}

export function cascadeDeleteChild(state: ParentOSWebState, childId: string): void {
  const deletedEntryIds = new Set(
    state.journalEntries.filter((entry) => entry.childId === childId).map((entry) => entry.entryId),
  );
  const deletedConversationIds = new Set(
    state.conversations.filter((conv) => conv.childId === childId).map((conv) => conv.conversationId),
  );
  state.children = state.children.filter((row) => row.childId !== childId);
  state.measurements = state.measurements.filter((row) => row.childId !== childId);
  state.milestoneRecords = state.milestoneRecords.filter((row) => row.childId !== childId);
  state.reminderStates = state.reminderStates.filter((row) => row.childId !== childId);
  state.customTodos = state.customTodos.filter((row) => row.childId !== childId);
  state.vaccineRecords = state.vaccineRecords.filter((row) => row.childId !== childId);
  state.journalEntries = state.journalEntries.filter((row) => row.childId !== childId);
  state.journalTags = state.journalTags.filter((row) => !deletedEntryIds.has(row.entryId));
  state.conversations = state.conversations.filter((row) => row.childId !== childId);
  state.aiMessages = state.aiMessages.filter((row) => !deletedConversationIds.has(row.conversationId));
  state.growthReports = state.growthReports.filter((row) => row.childId !== childId);
  state.dentalRecords = state.dentalRecords.filter((row) => row.childId !== childId);
  state.attachments = state.attachments.filter((row) => row.childId !== childId);
  state.allergyRecords = state.allergyRecords.filter((row) => row.childId !== childId);
  state.sleepRecords = state.sleepRecords.filter((row) => row.childId !== childId);
  state.medicalEvents = state.medicalEvents.filter((row) => row.childId !== childId);
  state.tannerAssessments = state.tannerAssessments.filter((row) => row.childId !== childId);
  state.fitnessAssessments = state.fitnessAssessments.filter((row) => row.childId !== childId);
  state.outdoorRecords = state.outdoorRecords.filter((row) => row.childId !== childId);
  delete state.outdoorGoals[childId];
  state.postureAssessments = state.postureAssessments.filter((row) => row.childId !== childId);
  state.healthRecordEvents = state.healthRecordEvents.filter((row) => row.childId !== childId);
  state.healthRecordValues = state.healthRecordValues.filter((row) => row.childId !== childId);
  state.orthodonticCases = state.orthodonticCases.filter((row) => row.childId !== childId);
  state.orthodonticAppliances = state.orthodonticAppliances.filter((row) => row.childId !== childId);
  state.orthodonticCheckins = state.orthodonticCheckins.filter((row) => row.childId !== childId);
  state.orthodonticUnwearIntervals = state.orthodonticUnwearIntervals.filter((row) => row.childId !== childId);
  state.orthodonticPhotoSessions = state.orthodonticPhotoSessions.filter((row) => row.childId !== childId);
  state.orthodonticPhotoAttachments = state.orthodonticPhotoAttachments.filter((row) => row.childId !== childId);
  delete state.visionFollowupSettings[childId];
}

function maxTimestamp(values: readonly (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (value && (!max || value > max)) {
      max = value;
    }
  }
  return max;
}

const GROWTH_METRICS = new Set(['growth.height', 'growth.weight', 'growth.head_circumference', 'growth.bmi']);
const VISION_METRICS = new Set([
  'vision.left_visual_acuity',
  'vision.right_visual_acuity',
  'vision.left_axial_length',
  'vision.right_axial_length',
  'vision.left_iop',
  'vision.right_iop',
]);
const TANNER_METRICS = new Set([
  'development.tanner_breast_stage',
  'development.tanner_genital_stage',
  'development.tanner_pubic_hair_stage',
  'development.bone_age_years',
  'development.body_fat_percentage',
]);
const FITNESS_METRICS = new Set([
  'fitness.run_50m',
  'fitness.vital_capacity',
  'fitness.run_800m',
  'fitness.run_1000m',
  'fitness.run_50x8',
  'fitness.sit_and_reach',
  'fitness.standing_long_jump',
  'fitness.sit_ups',
  'fitness.pull_ups',
  'fitness.rope_skipping',
  'fitness.run_10m_shuttle',
  'fitness.tennis_ball_throw',
  'fitness.double_foot_jump',
  'fitness.balance_beam',
  'fitness.foot_arch_status',
]);

export function computeProfileSectionSummaries(state: ParentOSWebState, childId: string): SectionSummary[] {
  const values = state.healthRecordValues.filter((row) => row.childId === childId);
  const eventsById = new Map(
    state.healthRecordEvents.filter((row) => row.childId === childId).map((row) => [row.eventId, row]),
  );
  const makeSummary = (sectionId: string, count: number, lastUpdatedAt: string | null): SectionSummary => ({
    sectionId,
    recordCount: count,
    lastUpdatedAt,
    state: count > 0 ? 'ok' : 'empty',
    errorMessage: null,
  });

  const growthVals = values.filter((row) => GROWTH_METRICS.has(row.metricId));
  const milestones = state.milestoneRecords.filter((row) => row.childId === childId);
  const vaccines = state.vaccineRecords.filter((row) => row.childId === childId);
  const visionVals = values.filter((row) => VISION_METRICS.has(row.metricId));
  const dentalVals = values.filter((row) => row.metricId === 'dental.event');
  const allergies = state.allergyRecords.filter((row) => row.childId === childId);
  const sleepVals = values.filter((row) => row.metricId === 'sleep.duration_minutes');
  const medicalVals = values.filter((row) => row.metricId === 'medical.event');
  const tannerVals = values.filter((row) => TANNER_METRICS.has(row.metricId));
  const fitnessVals = values.filter((row) => FITNESS_METRICS.has(row.metricId));
  const outdoorVals = values.filter((row) => row.metricId === 'outdoor.activity_minutes');

  return [
    makeSummary('growth', growthVals.length, maxTimestamp(growthVals.map((v) => v.createdAt))),
    makeSummary('milestones', milestones.length, maxTimestamp(milestones.map((m) => m.createdAt))),
    makeSummary('vaccines', vaccines.length, maxTimestamp(vaccines.map((v) => v.createdAt))),
    makeSummary('vision', visionVals.length, maxTimestamp(visionVals.map((v) => v.createdAt))),
    makeSummary('dental', dentalVals.length, maxTimestamp(dentalVals.map((v) => v.createdAt))),
    makeSummary('allergies', allergies.length, maxTimestamp(allergies.map((a) => a.updatedAt || a.createdAt))),
    makeSummary('sleep', sleepVals.length, maxTimestamp(sleepVals.map((v) => v.createdAt))),
    makeSummary(
      'medical-events',
      medicalVals.length,
      maxTimestamp(medicalVals.map((v) => eventsById.get(v.eventId)?.updatedAt ?? v.createdAt)),
    ),
    makeSummary('posture', 0, null),
    makeSummary('tanner', tannerVals.length, maxTimestamp(tannerVals.map((v) => v.createdAt))),
    makeSummary('fitness', fitnessVals.length, maxTimestamp(fitnessVals.map((v) => v.createdAt))),
    makeSummary('outdoor', outdoorVals.length, maxTimestamp(outdoorVals.map((v) => v.createdAt))),
  ];
}

export function computeOrthodonticDashboard(
  state: ParentOSWebState,
  childId: string,
): OrthodonticDashboardProjection {
  const childCases = state.orthodonticCases
    .filter((row) => row.childId === childId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const activeCase = childCases.find((row) => row.stage !== 'completed') ?? null;
  if (!activeCase) {
    return { activeCase: null, activeAppliances: [], nextReviewDate: null };
  }
  const activeAppliances = state.orthodonticAppliances.filter(
    (row) => row.caseId === activeCase.caseId && row.status !== 'completed',
  );
  const reviewDates = [
    activeCase.nextReviewDate,
    ...activeAppliances.map((row) => row.nextReviewDate),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0).sort();
  return {
    activeCase,
    activeAppliances,
    nextReviewDate: reviewDates[0] ?? null,
  };
}

export function computeOrthodonticJourney(
  state: ParentOSWebState,
  childId: string,
  caseId: string,
): OrthodonticJourney {
  const orthoCase = state.orthodonticCases.find(
    (row) => row.caseId === caseId && row.childId === childId,
  );
  if (!orthoCase) {
    return { past: [], future: [] };
  }
  const past: OrthodonticJourneyEntry[] = [
    {
      kind: 'case-started',
      occurredAt: orthoCase.startedAt,
      caseType: orthoCase.caseType,
      stage: orthoCase.stage,
    },
  ];
  const future: OrthodonticJourneyEntry[] = [];
  const appliances = state.orthodonticAppliances.filter((row) => row.caseId === caseId);
  for (const appliance of appliances) {
    past.push({
      kind: 'appliance-started',
      occurredAt: appliance.startedAt,
      applianceId: appliance.applianceId,
      applianceType: appliance.applianceType,
    });
    if (appliance.status === 'paused') {
      past.push({
        kind: 'appliance-paused',
        occurredAt: appliance.updatedAt,
        applianceId: appliance.applianceId,
        reason: appliance.pauseReason,
      });
    }
    if (appliance.status === 'completed' && appliance.endedAt) {
      past.push({
        kind: 'appliance-completed',
        occurredAt: appliance.endedAt,
        applianceId: appliance.applianceId,
      });
    }
    if (appliance.nextReviewDate) {
      future.push({
        kind: 'next-clinical-review',
        predictedAt: appliance.nextReviewDate,
        applianceId: appliance.applianceId,
        ruleId: 'PO-ORTHO-REVIEW',
      });
    }
  }
  for (const checkin of state.orthodonticCheckins.filter((row) => row.caseId === caseId)) {
    const occurredAt = checkin.checkinAt ?? `${checkin.checkinDate}T00:00:00Z`;
    if (checkin.checkinType === 'aligner-change' && checkin.alignerIndex !== null) {
      past.push({
        kind: 'aligner-change',
        occurredAt,
        applianceId: checkin.applianceId,
        alignerIndex: checkin.alignerIndex,
      });
    } else if (checkin.checkinType === 'expander-activation' && checkin.activationIndex !== null) {
      past.push({
        kind: 'expander-activation',
        occurredAt,
        applianceId: checkin.applianceId,
        activationIndex: checkin.activationIndex,
      });
    }
  }
  for (const interval of state.orthodonticUnwearIntervals.filter((row) => row.caseId === caseId)) {
    const durationHours = interval.endAt
      ? Math.max(0, (Date.parse(interval.endAt) - Date.parse(interval.startAt)) / 3_600_000)
      : null;
    past.push({
      kind: 'unwear-interval',
      startAt: interval.startAt,
      endAt: interval.endAt,
      durationHours,
      reason: interval.reason,
    });
  }
  for (const record of state.dentalRecords.filter(
    (row) => row.childId === childId && row.eventType.startsWith('ortho-'),
  )) {
    past.push({
      kind: 'clinical-event',
      occurredAt: record.eventDate,
      eventType: record.eventType,
      hospital: record.hospital,
      notes: record.notes,
      recordId: record.recordId,
    });
  }
  if (orthoCase.plannedEndAt) {
    future.push({ kind: 'case-planned-end', predictedAt: orthoCase.plannedEndAt });
  }
  const pastTime = (entry: OrthodonticJourneyEntry) => ('occurredAt' in entry ? entry.occurredAt : 'startAt' in entry ? entry.startAt : '');
  const futureTime = (entry: OrthodonticJourneyEntry) => ('predictedAt' in entry ? entry.predictedAt : '');
  past.sort((a, b) => pastTime(a).localeCompare(pastTime(b)));
  future.sort((a, b) => futureTime(a).localeCompare(futureTime(b)));
  return { past, future };
}
