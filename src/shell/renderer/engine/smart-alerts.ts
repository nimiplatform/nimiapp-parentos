/**
 * smart-alerts.ts — ParentOS 智能预警引擎
 *
 * 三个核心机制：
 * 1. 标签碰撞拦截器 — 交叉比对过敏原与疫苗/食物任务的风险标签
 * 2. 事件驱动动态任务 — 保存高优过敏事件后自动插入追踪任务
 * 3. 周期性条件预警 — 基于季节/慢性过敏档案下发防御性提醒
 */

import type { ActiveReminder } from './reminder-engine.js';
import {
  ALLERGEN_NORMALIZATION_RULES,
  ALLERGY_COLLISION_MESSAGES,
  ALLERGY_FOLLOWUP_SYMPTOM_GROUPS,
  ALLERGY_FOLLOWUP_TEMPLATES,
  CHRONIC_CONDITION_DETECTORS,
  DENTAL_FOLLOWUP_DESCRIPTION_TEMPLATE,
  DENTAL_FOLLOWUP_RULES,
  REMINDER_TAG_ALLERGEN_RULES,
  SEASONAL_ALERT_RULES,
  SMART_ALERT_MEDICAL_RULES,
} from '../knowledge-base/index.js';

/* ================================================================
   1. DATA STRUCTURES
   ================================================================ */

/** Child's allergy profile — extracted from allergy_records + children.allergies */
export interface AllergyProfile {
  /** Normalized allergen tags: e.g. ['egg', 'milk', 'peanut', 'dust-mite'] */
  allergenTags: string[];
  /** Active allergy categories */
  activeCategories: Set<string>;
  /** Has severe reaction history */
  hasSevereHistory: boolean;
  /** Chronic conditions (for seasonal alerts) */
  chronicConditions: string[]; // e.g. ['pollen-allergy', 'rhinitis', 'eczema']
}

/** Enhanced reminder with optional allergy warning */
export interface EnhancedReminder extends ActiveReminder {
  /** If set, this reminder has an allergy collision warning */
  allergyWarning?: {
    level: 'caution' | 'warning' | 'danger';
    message: string;
    matchedAllergens: string[];
  };
}

/** Dynamic follow-up task generated from events */
export interface DynamicTask {
  id: string;
  childId: string;
  title: string;
  description: string;
  triggerDate: string; // ISO date when to show
  domain: string;
  priority: 'P0' | 'P1' | 'P2';
  source: 'allergy-followup' | 'dental-followup' | 'seasonal-alert';
  linkedRecordId?: string;
}

/** Seasonal alert definition */
export interface SeasonalAlert {
  id: string;
  title: string;
  description: string;
  /** Months when this alert is active (1-12) */
  activeMonths: number[];
  /** Required chronic conditions to trigger */
  requiredConditions: string[];
  priority: 'P1' | 'P2';
}

/* ================================================================
   2. ALLERGEN TAG MAPPING
   ================================================================ */

const RULE_TAG_ALLERGEN_MAP = new Map(
  REMINDER_TAG_ALLERGEN_RULES.map((rule) => [rule.ruleTag, rule.allergenTags]),
);

function renderTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => String(values[key] ?? ''));
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0] ?? date.toISOString();
}

function requireConfiguredNumber(value: number | undefined, field: string) {
  if (typeof value !== 'number') {
    throw new Error(`smart-alert-rules is missing numeric field ${field}`);
  }
  return value;
}

function requireConfiguredString(value: string | undefined, field: string) {
  if (!value) {
    throw new Error(`smart-alert-rules is missing string field ${field}`);
  }
  return value;
}

/* ================================================================
   3. TAG COLLISION INTERCEPTOR
   ================================================================ */

/**
 * Normalize a free-text allergen string into standard tags.
 */
export function normalizeAllergen(allergen: string): string[] {
  const lower = allergen.toLowerCase().trim();
  const tags: string[] = [];
  for (const rule of ALLERGEN_NORMALIZATION_RULES) {
    if (lower.includes(rule.match.toLowerCase())) {
      tags.push(...rule.tags);
    }
  }
  // If no match, use the raw string as a tag
  if (tags.length === 0) tags.push(lower);
  return [...new Set(tags)];
}

/**
 * Build an AllergyProfile from raw allergy data.
 */
export function buildAllergyProfile(
  allergies: string[] | null,
  allergyRecords: Array<{ allergen: string; category: string; severity: string; status: string; notes: string | null }>,
): AllergyProfile {
  const tagSet = new Set<string>();
  const categories = new Set<string>();
  let hasSevere = false;
  const chronic: string[] = [];

  // From children.allergies (simple string array)
  if (allergies) {
    for (const a of allergies) {
      for (const t of normalizeAllergen(a)) tagSet.add(t);
    }
  }

  // From structured allergy_records
  for (const rec of allergyRecords) {
    if (rec.status !== 'active') continue;
    for (const t of normalizeAllergen(rec.allergen)) tagSet.add(t);
    categories.add(rec.category);
    if (rec.severity === 'severe') hasSevere = true;

    for (const detector of CHRONIC_CONDITION_DETECTORS) {
      const source = detector.sourceField === 'notes' ? (rec.notes ?? '') : rec.allergen;
      const lower = source.toLowerCase();
      if (detector.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
        chronic.push(detector.conditionId);
      }
    }
  }

  return {
    allergenTags: [...tagSet],
    activeCategories: categories,
    hasSevereHistory: hasSevere,
    chronicConditions: [...new Set(chronic)],
  };
}

/**
 * INTERCEPTOR: Enhance reminders with allergy collision warnings.
 *
 * For each active reminder, checks if its tags overlap with the child's
 * allergy profile. If so, attaches a warning to the reminder.
 */
export function interceptAllergyCollisions(
  reminders: ActiveReminder[],
  profile: AllergyProfile,
): EnhancedReminder[] {
  if (profile.allergenTags.length === 0) {
    return reminders; // No allergies, pass through
  }

  const allergenSet = new Set(profile.allergenTags);

  return reminders.map((reminder): EnhancedReminder => {
    const ruleTags = reminder.rule.tags ?? [];
    const matched: string[] = [];

    for (const tag of ruleTags) {
      // Direct tag match
      if (allergenSet.has(tag)) {
        matched.push(tag);
      }
      // Indirect match via rule-tag-to-allergen map
      const relatedAllergens = RULE_TAG_ALLERGEN_MAP.get(tag);
      if (relatedAllergens) {
        for (const ra of relatedAllergens) {
          if (allergenSet.has(ra)) matched.push(ra);
        }
      }
    }

    if (matched.length === 0) return reminder;

    // Determine warning level
    const uniqueMatched = [...new Set(matched)];
    const level: 'caution' | 'warning' | 'danger' =
      profile.hasSevereHistory ? 'danger' : uniqueMatched.length > 1 ? 'warning' : 'caution';

    const allergenNames = uniqueMatched.join('、');
    const message = renderTemplate(
      level === 'danger'
        ? ALLERGY_COLLISION_MESSAGES.dangerTemplate
        : ALLERGY_COLLISION_MESSAGES.nonDangerTemplate,
      { allergenNames },
    );

    return {
      ...reminder,
      allergyWarning: { level, message, matchedAllergens: uniqueMatched },
    };
  });
}

/* ================================================================
   4. EVENT-DRIVEN DYNAMIC TASKS
   ================================================================ */

/**
 * Generate follow-up tasks when a significant allergy event is saved.
 *
 * Call this after saving an allergy record. Returns tasks to insert
 * into the reminder system.
 */
export function generateAllergyFollowups(
  childId: string,
  event: {
    allergen: string;
    severity: string;
    symptoms: string[]; // symptom keys like 'rash', 'wheeze'
    eventDate: string;  // ISO date
  },
): DynamicTask[] {
  const tasks: DynamicTask[] = [];

  const hasSkin = event.symptoms.some((symptom) => ALLERGY_FOLLOWUP_SYMPTOM_GROUPS.skin.includes(symptom));
  const hasResp = event.symptoms.some((symptom) => ALLERGY_FOLLOWUP_SYMPTOM_GROUPS.respiratory.includes(symptom));
  const hasGI = event.symptoms.some((symptom) => ALLERGY_FOLLOWUP_SYMPTOM_GROUPS.gastrointestinal.includes(symptom));
  const isAnaphylaxis = event.symptoms.some((symptom) => ALLERGY_FOLLOWUP_SYMPTOM_GROUPS.anaphylaxis.includes(symptom));

  for (const template of ALLERGY_FOLLOWUP_TEMPLATES) {
    const shouldCreate = (
      (template.condition === 'anaphylaxis' && isAnaphylaxis) ||
      (template.condition === 'skin_without_anaphylaxis' && hasSkin && !isAnaphylaxis) ||
      (template.condition === 'respiratory_without_anaphylaxis' && hasResp && !isAnaphylaxis) ||
      (template.condition === 'gastrointestinal' && hasGI) ||
      (template.condition === 'severe_without_anaphylaxis' && event.severity === 'severe' && !isAnaphylaxis)
    );
    if (!shouldCreate) continue;
    tasks.push({
      id: `${template.idPrefix}-${Date.now()}`,
      childId,
      title: renderTemplate(template.titleTemplate, { allergen: event.allergen }),
      description: renderTemplate(template.descriptionTemplate, { allergen: event.allergen }),
      triggerDate: addDays(event.eventDate, template.offsetDays),
      domain: template.domain,
      priority: template.priority,
      source: template.source,
    });
  }

  return tasks;
}

/**
 * Generate follow-up reminder for dental events.
 */
export function generateDentalFollowup(
  childId: string,
  eventType: string,
  eventDate: string,
): DynamicTask | null {
  const config = DENTAL_FOLLOWUP_RULES.find((rule) => rule.eventType === eventType);
  if (!config) return null;

  const nextDate = new Date(eventDate);
  nextDate.setMonth(nextDate.getMonth() + config.months);
  const titleStem = config.title.replace('复查', '').replace('定期', '');

  return {
    id: `dental-followup-${eventType}-${Date.now()}`,
    childId,
    title: config.title,
    description: renderTemplate(DENTAL_FOLLOWUP_DESCRIPTION_TEMPLATE, {
      titleStem,
      months: config.months,
    }),
    triggerDate: nextDate.toISOString().split('T')[0] ?? nextDate.toISOString(),
    domain: 'dental',
    priority: 'P2',
    source: 'dental-followup',
  };
}

/* ================================================================
   5. SEASONAL / CONDITIONAL ALERTS
   ================================================================ */

/**
 * Check which seasonal alerts should fire based on current date
 * and the child's chronic conditions.
 */
export function getActiveSeasonalAlerts(
  profile: AllergyProfile,
  currentDate: Date = new Date(),
): DynamicTask[] {
  const month = currentDate.getMonth() + 1; // 1-12
  const conditionSet = new Set(profile.chronicConditions);
  // Also check allergen tags for conditions
  if (profile.allergenTags.includes('dust-mite')) conditionSet.add('dust-mite');

  const tasks: DynamicTask[] = [];

  for (const alert of SEASONAL_ALERT_RULES) {
    if (!alert.activeMonths.includes(month)) continue;
    if (!alert.requiredConditions.every((c) => conditionSet.has(c))) continue;

    tasks.push({
      id: alert.id,
      childId: '', // Caller fills this in
      title: alert.title,
      description: alert.description,
      triggerDate: currentDate.toISOString().split('T')[0] ?? currentDate.toISOString(),
      domain: 'allergy',
      priority: alert.priority,
      source: 'seasonal-alert',
    });
  }

  return tasks;
}

/* ================================================================
   6. FRONT-END JSON CONTRACT
   ================================================================ */

/**
 * Example of the enhanced task JSON sent to the front-end:
 *
 * {
 *   "ruleId": "PO-REM-VAC-015",
 *   "title": "流感疫苗（推荐）",
 *   "priority": "P1",
 *   "status": "active",
 *   "domain": "vaccine",
 *   "allergyWarning": {
 *     "level": "warning",
 *     "message": "可能含 egg 成分，建议接种前告知医生过敏情况",
 *     "matchedAllergens": ["egg"]
 *   }
 * }
 *
 * Dynamic tasks (follow-ups, seasonal):
 *
 * {
 *   "id": "allergy-followup-skin-1712345678",
 *   "title": "观察 鸡蛋 过敏皮疹消退情况",
 *   "description": "拍照记录今日皮疹范围...",
 *   "triggerDate": "2026-04-08",
 *   "domain": "allergy",
 *   "priority": "P1",
 *   "source": "allergy-followup"
 * }
 */

/* ================================================================
   7. MEDICAL EVENT SMART ANALYSIS
   ================================================================ */

/** Diagnosis entry extracted from medical events */
export interface DiagnosisEntry {
  diagnosis: string;
  count: number;
  lastDate: string;
  hospitals: string[];
  severity: string | null;
}

/** Medication entry extracted from medical events */
export interface MedicationEntry {
  name: string;
  dosage: string | null;
  count: number;
  lastDate: string;
  relatedDiagnoses: string[];
}

/** Medical alert generated from event pattern analysis */
export interface MedicalAlert {
  level: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  relatedEventIds: string[];
}

/** Full medical analysis result */
export interface MedicalAnalysis {
  diagnoses: DiagnosisEntry[];
  medications: MedicationEntry[];
  alerts: MedicalAlert[];
  /** Stats */
  totalEvents: number;
  eventsByType: Record<string, number>;
  frequentHospitals: string[];
}

/**
 * Analyze medical events and produce a structured summary of diagnoses,
 * medications, and pattern-based alerts.
 */
export function analyzeMedicalEvents(
  events: Array<{
    eventId: string;
    eventType: string;
    title: string;
    eventDate: string;
    severity: string | null;
    hospital: string | null;
    medication: string | null;
    dosage: string | null;
    notes: string | null;
  }>,
): MedicalAnalysis {
  const diagMap = new Map<string, DiagnosisEntry>();
  const medMap = new Map<string, MedicationEntry>();
  const eventsByType: Record<string, number> = {};
  const hospitalCounts = new Map<string, number>();
  const alerts: MedicalAlert[] = [];

  for (const ev of events) {
    // Count by type
    eventsByType[ev.eventType] = (eventsByType[ev.eventType] ?? 0) + 1;

    // Track hospitals
    if (ev.hospital) {
      hospitalCounts.set(ev.hospital, (hospitalCounts.get(ev.hospital) ?? 0) + 1);
    }

    // Extract diagnosis from title
    const diagKey = ev.title.trim();
    if (diagKey) {
      const existing = diagMap.get(diagKey);
      if (existing) {
        existing.count++;
        if (ev.eventDate > existing.lastDate) existing.lastDate = ev.eventDate;
        if (ev.hospital && !existing.hospitals.includes(ev.hospital)) {
          existing.hospitals.push(ev.hospital);
        }
        if (ev.severity === 'severe') existing.severity = 'severe';
      } else {
        diagMap.set(diagKey, {
          diagnosis: diagKey,
          count: 1,
          lastDate: ev.eventDate,
          hospitals: ev.hospital ? [ev.hospital] : [],
          severity: ev.severity,
        });
      }
    }

    // Extract medications
    if (ev.medication) {
      for (const medName of ev.medication.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean)) {
        const existing = medMap.get(medName);
        if (existing) {
          existing.count++;
          if (ev.eventDate > existing.lastDate) existing.lastDate = ev.eventDate;
          if (diagKey && !existing.relatedDiagnoses.includes(diagKey)) {
            existing.relatedDiagnoses.push(diagKey);
          }
        } else {
          medMap.set(medName, {
            name: medName,
            dosage: ev.dosage,
            count: 1,
            lastDate: ev.eventDate,
            relatedDiagnoses: diagKey ? [diagKey] : [],
          });
        }
      }
    }
  }

  // ── Pattern-based alerts ──

  // 1. Frequent visits
  const frequentVisitsRule = SMART_ALERT_MEDICAL_RULES.frequentVisits;
  const frequentVisitsWindowDays = requireConfiguredNumber(frequentVisitsRule.windowDays, 'medicalAlerts.frequentVisits.windowDays');
  const frequentVisitsThresholdCount = requireConfiguredNumber(frequentVisitsRule.thresholdCount, 'medicalAlerts.frequentVisits.thresholdCount');
  const now = Date.now();
  const recentEvents = events.filter(
    (e) => now - new Date(e.eventDate).getTime() < frequentVisitsWindowDays * 24 * 60 * 60 * 1000,
  );
  if (recentEvents.length >= frequentVisitsThresholdCount) {
    alerts.push({
      level: frequentVisitsRule.level,
      title: requireConfiguredString(frequentVisitsRule.title, 'medicalAlerts.frequentVisits.title'),
      message: renderTemplate(frequentVisitsRule.messageTemplate, {
        windowDays: frequentVisitsWindowDays,
        count: recentEvents.length,
      }),
      relatedEventIds: recentEvents.map((e) => e.eventId),
    });
  }

  // 2. Repeated same diagnosis
  const repeatedDiagnosisRule = SMART_ALERT_MEDICAL_RULES.repeatedDiagnosis;
  const repeatedDiagnosisThresholdCount = requireConfiguredNumber(repeatedDiagnosisRule.thresholdCount, 'medicalAlerts.repeatedDiagnosis.thresholdCount');
  const repeatedDiagnosisTitleTemplate = requireConfiguredString(repeatedDiagnosisRule.titleTemplate, 'medicalAlerts.repeatedDiagnosis.titleTemplate');
  for (const diag of diagMap.values()) {
    if (diag.count >= repeatedDiagnosisThresholdCount) {
      alerts.push({
        level: repeatedDiagnosisRule.level,
        title: renderTemplate(repeatedDiagnosisTitleTemplate, { diagnosis: diag.diagnosis }),
        message: renderTemplate(repeatedDiagnosisRule.messageTemplate, {
          diagnosis: diag.diagnosis,
          count: diag.count,
        }),
        relatedEventIds: events
          .filter((e) => e.title.trim() === diag.diagnosis)
          .map((e) => e.eventId),
      });
    }
  }

  // 3. Severe events without follow-up
  const severeWithoutFollowupRule = SMART_ALERT_MEDICAL_RULES.severeWithoutFollowup;
  const severeFollowupWindowDays = requireConfiguredNumber(severeWithoutFollowupRule.followupWindowDays, 'medicalAlerts.severeWithoutFollowup.followupWindowDays');
  const severeRecentWindowDays = requireConfiguredNumber(severeWithoutFollowupRule.recentWindowDays, 'medicalAlerts.severeWithoutFollowup.recentWindowDays');
  const severeTitleTemplate = requireConfiguredString(severeWithoutFollowupRule.titleTemplate, 'medicalAlerts.severeWithoutFollowup.titleTemplate');
  const severeEvents = events
    .filter((e) => e.severity === 'severe')
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  for (const sev of severeEvents) {
    const sevDate = new Date(sev.eventDate).getTime();
    const hasFollowup = events.some(
      (e) =>
        e.eventId !== sev.eventId &&
        e.title.trim() === sev.title.trim() &&
        new Date(e.eventDate).getTime() > sevDate &&
        new Date(e.eventDate).getTime() - sevDate < severeFollowupWindowDays * 24 * 60 * 60 * 1000,
    );
    if (!hasFollowup && now - sevDate < severeRecentWindowDays * 24 * 60 * 60 * 1000) {
      alerts.push({
        level: severeWithoutFollowupRule.level,
        title: renderTemplate(severeTitleTemplate, { title: sev.title }),
        message: renderTemplate(severeWithoutFollowupRule.messageTemplate, {
          date: sev.eventDate.split('T')[0] ?? sev.eventDate,
        }),
        relatedEventIds: [sev.eventId],
      });
    }
  }

  // 4. Long-term medication usage
  const longTermMedicationRule = SMART_ALERT_MEDICAL_RULES.longTermMedication;
  const longTermMedicationThresholdCount = requireConfiguredNumber(longTermMedicationRule.thresholdCount, 'medicalAlerts.longTermMedication.thresholdCount');
  const longTermMedicationTitleTemplate = requireConfiguredString(longTermMedicationRule.titleTemplate, 'medicalAlerts.longTermMedication.titleTemplate');
  for (const med of medMap.values()) {
    if (med.count >= longTermMedicationThresholdCount) {
      alerts.push({
        level: longTermMedicationRule.level,
        title: renderTemplate(longTermMedicationTitleTemplate, { medication: med.name }),
        message: renderTemplate(longTermMedicationRule.messageTemplate, {
          medication: med.name,
          count: med.count,
        }),
        relatedDiagnoses: med.relatedDiagnoses,
        relatedEventIds: events
          .filter((e) => e.medication?.includes(med.name))
          .map((e) => e.eventId),
      } as MedicalAlert);
    }
  }

  // Sort
  const diagnoses = [...diagMap.values()].sort((a, b) => b.count - a.count);
  const medications = [...medMap.values()].sort((a, b) => b.count - a.count);
  const frequentHospitals = [...hospitalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([h]) => h);

  return {
    diagnoses,
    medications,
    alerts,
    totalEvents: events.length,
    eventsByType,
    frequentHospitals,
  };
}
