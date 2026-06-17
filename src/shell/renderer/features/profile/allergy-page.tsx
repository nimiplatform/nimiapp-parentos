import { Button, DashedAddButton, DatePicker, Surface, TextareaField, TextField } from '@nimiplatform/kit/ui';
import {
  HealthRecordModalShell,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { useState, useEffect } from 'react';
import { useAppStore, computeAgeMonths, computeAgeMonthsAt, formatAge } from '../../app-shell/app-store.js';
import { insertAllergyRecord, updateAllergyRecord, getAllergyRecords, upsertReminderState } from '../../bridge/sqlite-bridge.js';
import type { AllergyRecordRow } from '../../bridge/sqlite-bridge.js';
import { generateAllergyFollowups } from '../../engine/smart-alerts.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { AISummaryCard } from './ai-summary-card.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { i18nText } from '../../i18n/index.js';


/* ── Constants ───────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  food: i18nText('Allergy.category.food'),
  drug: i18nText('Allergy.category.drug'),
  environmental: i18nText('Allergy.category.environmental'),
  contact: i18nText('Allergy.category.contact'),
  other: i18nText('Allergy.category.other'),
};
const STATUS_LABELS: Record<string, string> = {
  active: i18nText('Allergy.status.active'),
  outgrown: i18nText('Allergy.status.outgrown'),
  uncertain: i18nText('Allergy.status.uncertain'),
};
const SEVERITY_LABELS: Record<string, string> = {
  mild: i18nText('Allergy.severity.mild'),
  moderate: i18nText('Allergy.severity.moderate'),
  severe: i18nText('Allergy.severity.severe'),
};
const CONFIRMED_LABELS: Record<string, string> = {
  'clinical-test': i18nText('Allergy.confirmedBy.clinicalTest'),
  'physician-diagnosis': i18nText('Allergy.confirmedBy.physicianDiagnosis'),
  'parent-observation': i18nText('Allergy.confirmedBy.parentObservation'),
};
const ALLERGY_NOTE_MARKERS = {
  symptoms: 'symptoms:',
  treatments: 'treatments:',
  photo: 'photo:',
} as const;

// Quick-pick allergen tags
const COMMON_ALLERGENS: Array<{ label: string; category: string }> = [
  { label: i18nText('Allergy.commonAllergen.milk'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.egg'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.peanut'), category: 'food' },
  { label: i18nText('Allergy.commonAllergen.treeNut'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.wheat'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.soy'), category: 'food' },
  { label: i18nText('Allergy.commonAllergen.shellfish'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.fish'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.mango'), category: 'food' },
  { label: i18nText('Allergy.commonAllergen.peach'), category: 'food' }, { label: i18nText('Allergy.commonAllergen.dustMite'), category: 'environmental' }, { label: i18nText('Allergy.commonAllergen.pollen'), category: 'environmental' },
  { label: i18nText('Allergy.commonAllergen.catDander'), category: 'environmental' }, { label: i18nText('Allergy.commonAllergen.dogDander'), category: 'environmental' }, { label: i18nText('Allergy.commonAllergen.mold'), category: 'environmental' },
  { label: i18nText('Allergy.commonAllergen.penicillin'), category: 'drug' }, { label: i18nText('Allergy.commonAllergen.cephalosporin'), category: 'drug' }, { label: i18nText('Allergy.commonAllergen.amoxicillin'), category: 'drug' },
  { label: i18nText('Allergy.commonAllergen.latex'), category: 'contact' }, { label: i18nText('Allergy.commonAllergen.nickel'), category: 'contact' },
];

// Reaction symptom tags (multi-select)
const SYMPTOM_TAGS = [
  { key: 'rash', label: i18nText('Allergy.symptom.rash'), emoji: '🔴' },
  { key: 'hives', label: i18nText('Allergy.symptom.hives'), emoji: '⭕' },
  { key: 'eczema', label: i18nText('Allergy.symptom.eczema'), emoji: '🟠' },
  { key: 'swelling', label: i18nText('Allergy.symptom.swelling'), emoji: '🫧' },
  { key: 'itching', label: i18nText('Allergy.symptom.itching'), emoji: '😣' },
  { key: 'vomiting', label: i18nText('Allergy.symptom.vomiting'), emoji: '🤮' },
  { key: 'diarrhea', label: i18nText('Allergy.symptom.diarrhea'), emoji: '💩' },
  { key: 'abdominal', label: i18nText('Allergy.symptom.abdominal'), emoji: '😫' },
  { key: 'runny-nose', label: i18nText('Allergy.symptom.runnyNose'), emoji: '🤧' },
  { key: 'cough', label: i18nText('Allergy.symptom.cough'), emoji: '😮‍💨' },
  { key: 'wheeze', label: i18nText('Allergy.symptom.wheeze'), emoji: '😰' },
  { key: 'eye-itch', label: i18nText('Allergy.symptom.eyeItch'), emoji: '👁️' },
  { key: 'anaphylaxis', label: i18nText('Allergy.symptom.anaphylaxis'), emoji: '🚨' },
] as const;

// Treatment tags
const TREATMENT_TAGS = [
  i18nText('Allergy.treatment.stopExposure'),
  i18nText('Allergy.treatment.oralAntihistamine'),
  i18nText('Allergy.treatment.topicalSteroid'),
  i18nText('Allergy.treatment.oralSteroid'),
  i18nText('Allergy.treatment.epinephrinePen'),
  i18nText('Allergy.treatment.nebulization'),
  i18nText('Allergy.treatment.emergencyCare'),
  i18nText('Allergy.treatment.coldCompress'),
  i18nText('Allergy.treatment.observeNoMedication'),
] as const;

const choiceChipClass = (selected: boolean) =>
  `rounded-full border px-2.5 py-1 text-[13px] transition-all ${selected
    ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
    : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] text-[var(--nimi-text-muted)]'}`;

const roundedChoiceClass = (selected: boolean, extra = '') =>
  `rounded-2xl border px-2.5 py-1.5 text-[13px] transition-all ${selected
    ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
    : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] text-[var(--nimi-text-muted)]'} ${extra}`;

const severityClass = (severity: string) => {
  if (severity === 'severe') return 'border-[color-mix(in_srgb,var(--nimi-status-danger)_35%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-danger)]';
  if (severity === 'moderate') return 'border-[color-mix(in_srgb,var(--nimi-status-warning)_35%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]';
  return 'border-[color-mix(in_srgb,var(--nimi-text-primary)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-text-primary)_8%,var(--nimi-surface-card))] text-[var(--nimi-text-primary)]';
};

const severityBorderClass = (severity: string) => {
  if (severity === 'severe') return 'border-l-[var(--nimi-status-danger)]';
  if (severity === 'moderate') return 'border-l-[var(--nimi-status-warning)]';
  return 'border-l-[var(--nimi-text-primary)]';
};

const statusClass = (status: string) => {
  if (status === 'active') return 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-danger)]';
  if (status === 'outgrown') return 'bg-[color-mix(in_srgb,var(--nimi-status-success)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]';
  return 'bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-muted)]';
};

/* ── Main page ───────────────────────────────────────────── */

export default function AllergyPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [records, setRecords] = useState<AllergyRecordRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showMore, setShowMore] = useState<false | 'allergens' | 'symptoms' | 'medical'>(false);

  // Form state — core
  const [formAllergen, setFormAllergen] = useState('');
  const [formCategory, setFormCategory] = useState('food');
  const [formSeverity, setFormSeverity] = useState('');
  const [formDiagnosedAt, setFormDiagnosedAt] = useState(new Date().toISOString().slice(0, 10));

  // Form state — optional details
  const [formSymptoms, setFormSymptoms] = useState<Set<string>>(new Set());
  const [formTreatments, setFormTreatments] = useState<Set<string>>(new Set());
  const [formStatus, setFormStatus] = useState('active');
  const [formConfirmedBy, setFormConfirmedBy] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCustomSymptom, setFormCustomSymptom] = useState('');
  const [formCustomTreatment, setFormCustomTreatment] = useState('');
  // Photo is stored as notes reference (actual file handling would need Tauri FS)
  const [formPhotoName, setFormPhotoName] = useState('');

  useEffect(() => {
    if (activeChildId) getAllergyRecords(activeChildId).then(setRecords).catch(catchLog('allergy', 'action:load-allergy-records-failed'));
  }, [activeChildId]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Allergy.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const activeRecords = records.filter((r) => r.status === 'active');
  const otherRecords = records.filter((r) => r.status !== 'active');

  const toggleSymptom = (key: string) => setFormSymptoms((prev) => {
    const next = new Set(prev);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  });
  const toggleTreatment = (t: string) => setFormTreatments((prev) => {
    const next = new Set(prev);
    if (next.has(t)) {
      next.delete(t);
    } else {
      next.add(t);
    }
    return next;
  });

  const resetForm = () => {
    setFormAllergen(''); setFormCategory('food'); setFormSeverity(''); setFormDiagnosedAt(new Date().toISOString().slice(0, 10));
    setFormSymptoms(new Set()); setFormTreatments(new Set()); setFormStatus('active');
    setFormConfirmedBy(''); setFormNotes(''); setFormCustomSymptom(''); setFormCustomTreatment('');
    setFormPhotoName(''); setShowMore(false); setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formAllergen.trim() || !formSeverity) return;
    const now = isoNow();
    // Build structured notes
    const parts: string[] = [];
    const allSymptoms = [...formSymptoms].map((k) => SYMPTOM_TAGS.find((t) => t.key === k)?.label ?? k);
    if (formCustomSymptom.trim()) allSymptoms.push(formCustomSymptom.trim());
    if (allSymptoms.length > 0) {
      parts.push(`${ALLERGY_NOTE_MARKERS.symptoms} ${allSymptoms.join(i18nText('Common.list.separator'))}`);
    }
    const allTreatments = [...formTreatments];
    if (formCustomTreatment.trim()) allTreatments.push(formCustomTreatment.trim());
    if (allTreatments.length > 0) {
      parts.push(`${ALLERGY_NOTE_MARKERS.treatments} ${allTreatments.join(i18nText('Common.list.separator'))}`);
    }
    if (formPhotoName) parts.push(`${ALLERGY_NOTE_MARKERS.photo} ${formPhotoName}`);
    if (formNotes) parts.push(formNotes);
    const noteStr = parts.length > 0 ? parts.join(' | ') : null;
    const reactionType = formSymptoms.has('anaphylaxis') ? 'anaphylaxis' : formSymptoms.has('wheeze') || formSymptoms.has('cough') ? 'respiratory' : formSymptoms.has('vomiting') || formSymptoms.has('diarrhea') || formSymptoms.has('abdominal') ? 'gastrointestinal' : formSymptoms.size > 0 ? 'skin' : null;

    try {
      await insertAllergyRecord({
        recordId: ulid(), childId: child.childId, allergen: formAllergen.trim(), category: formCategory,
        reactionType, severity: formSeverity, diagnosedAt: formDiagnosedAt || null,
        ageMonthsAtDiagnosis: formDiagnosedAt ? computeAgeMonthsAt(child.birthDate, formDiagnosedAt) : null,
        status: formStatus, statusChangedAt: now, confirmedBy: formConfirmedBy || null, notes: noteStr, now,
      });
      setRecords(await getAllergyRecords(child.childId));

      // Generate follow-up tasks based on symptoms and severity
      const followups = generateAllergyFollowups(child.childId, {
        allergen: formAllergen.trim(),
        severity: formSeverity,
        symptoms: [...formSymptoms],
        eventDate: formDiagnosedAt || (now.split('T')[0] ?? now),
      });
      for (const task of followups) {
        try {
          await upsertReminderState({
            stateId: ulid(), childId: child.childId,
            ruleId: task.id, status: 'active', activatedAt: now,
            completedAt: null, dismissedAt: null, dismissReason: null,
            repeatIndex: 0, nextTriggerAt: task.triggerDate,
            notes: `${task.title}: ${task.description}`, now,
          });
        } catch { /* skip if duplicate */ }
      }

      resetForm();
    } catch { /* bridge */ }
  };

  const handleMarkOutgrown = async (r: AllergyRecordRow) => {
    const now = isoNow();
    try {
      await updateAllergyRecord({ recordId: r.recordId, allergen: r.allergen, category: r.category, reactionType: r.reactionType, severity: r.severity, status: 'outgrown', statusChangedAt: now, confirmedBy: r.confirmedBy, notes: r.notes, now });
      setRecords(await getAllergyRecords(child.childId));
    } catch { /* bridge */ }
  };

  return (
    <ProfileDetailShell
      title={i18nText('Allergy.page.title')}
      actions={!showForm ? (
        <Button onClick={() => setShowForm(true)} tone="primary" size="md">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {i18nText('Allergy.page.recordAllergy')}
        </Button>
      ) : null}
      aiSummary={
        <AISummaryCard domain="allergy" childName={child.displayName} childId={child.childId}
          ageLabel={formatAge(ageMonths)} gender={child.gender}
          dataContext={activeRecords.length > 0 ? i18nText('Allergy.context.activeAllergens', {
            items: activeRecords
              .map((r) => `${r.allergen}(${SEVERITY_LABELS[r.severity] ?? r.severity})`)
              .join(i18nText('Common.list.separator')),
          }) : ''} />
      }
    >
      {/* ── Form ─────────────────────────────────────────── */}
      {showForm && (
        <HealthRecordModalShell open size="M" onClose={resetForm}>
          <ModalHeader title={i18nText('Allergy.form.title')} icon="🤧" onClose={resetForm} />
          <ModalContent>

            {/* ━━ Section 1: Core ━━ */}
            <div className="space-y-3 pb-4">

              {/* Allergen */}
              <div>
                <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.allergen')} <span className="text-[var(--nimi-status-danger)]">*</span></p>
                <TextField value={formAllergen} onChange={(e) => setFormAllergen(e.target.value)} placeholder={i18nText('Allergy.form.allergenPlaceholder')} className="w-full" />
              </div>

              {/* Quick-pick: top 6 visible, rest in expandable row */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ALLERGENS.slice(0, 6).map((a) => (
                  <button key={a.label} onClick={() => { setFormAllergen(a.label); setFormCategory(a.category); }}
                    className={choiceChipClass(formAllergen === a.label)}>
                    {a.label}
                  </button>
                ))}
                <button onClick={() => setShowMore(showMore === 'allergens' ? false : 'allergens')}
                  className={choiceChipClass(showMore === 'allergens')}>
                  {i18nText('Allergy.form.moreAllergens')}
                </button>
              </div>
              {showMore === 'allergens' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {COMMON_ALLERGENS.slice(6).map((a) => (
                    <button key={a.label} onClick={() => { setFormAllergen(a.label); setFormCategory(a.category); }}
                      className={choiceChipClass(formAllergen === a.label)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Date + Severity side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.occurredAt')} <span className="text-[var(--nimi-status-danger)]">*</span></p>
                  <DatePicker
                    value={formDiagnosedAt}
                    onChange={setFormDiagnosedAt}
                  />
                </div>
                <div>
                  <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.severity')} <span className="text-[var(--nimi-status-danger)]">*</span></p>
                  <div className="flex gap-1.5">
                    {(['mild', 'moderate', 'severe'] as const).map((sv) => (
                      <button key={sv} onClick={() => setFormSeverity(formSeverity === sv ? '' : sv)}
                        className={`flex-1 rounded-2xl border py-2 text-[13px] font-medium transition-all ${formSeverity === sv ? severityClass(sv) : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] text-[var(--nimi-text-muted)]'}`}>
                        {SEVERITY_LABELS[sv]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ━━ Section 2: Symptoms + Photo ━━ */}
            <div className="space-y-3 border-t border-[var(--nimi-border-subtle)] py-4">
              <p className="text-[13px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.symptoms')} <span className="font-normal">{i18nText('Allergy.form.multiSelectHint')}</span></p>

              {/* Top 6 symptoms visible */}
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOM_TAGS.slice(0, 6).map((t) => (
                  <button key={t.key} onClick={() => toggleSymptom(t.key)}
                    className={roundedChoiceClass(formSymptoms.has(t.key))}>
                    {t.label}
                  </button>
                ))}
                <button onClick={() => setShowMore(showMore === 'symptoms' ? false : 'symptoms')}
                  className={roundedChoiceClass(showMore === 'symptoms')}>
                  {i18nText('Allergy.form.moreSymptoms')}
                </button>
              </div>
              {showMore === 'symptoms' && (
                <div className="flex flex-wrap gap-1.5">
                  {SYMPTOM_TAGS.slice(6).map((t) => (
                    <button key={t.key} onClick={() => toggleSymptom(t.key)}
                      className={roundedChoiceClass(formSymptoms.has(t.key))}>
                      {t.label}
                    </button>
                  ))}
                  <TextField value={formCustomSymptom} onChange={(e) => setFormCustomSymptom(e.target.value)}
                    placeholder={i18nText('Allergy.form.customSymptomPlaceholder')}
                    className="w-32" />
                </div>
              )}

              {/* Photo — tight to symptoms */}
              <div>
                <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">
                  {i18nText('Allergy.form.photo')} <span className="font-normal">{i18nText('Allergy.form.photoHint')}</span>
                </p>
                {formPhotoName ? (
                  <div className="group flex w-full items-center gap-2 rounded-2xl border border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-card)] px-4 py-2 text-[14px] text-[var(--nimi-text-primary)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={'var(--nimi-action-primary-bg)'} strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M3 8h2l2-3h10l2 3h2" />
                    </svg>
                    <span className="truncate flex-1">{formPhotoName}</span>
                    <button onClick={() => setFormPhotoName('')}
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[12px] text-[var(--nimi-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[color-mix(in_srgb,var(--nimi-status-danger)_10%,transparent)] hover:text-[var(--nimi-status-danger)]">✕</button>
                  </div>
                ) : (
                  <DashedAddButton
                    shape="tile"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
                      input.onchange = () => {
                        const files = input.files;
                        if (files && files.length > 0) setFormPhotoName(Array.from(files).map((f) => f.name).join(', '));
                      };
                      input.click();
                    }}
                    label={i18nText('Allergy.form.photoUpload')}
                  />
                )}
              </div>
            </div>

            {/* ━━ Section 3: Medical details (collapsed) ━━ */}
            <div className="border-t border-[var(--nimi-border-subtle)] py-3">
              <button onClick={() => setShowMore(showMore === 'medical' ? false : 'medical')}
                className="flex items-center gap-1.5 text-[13px] font-medium w-full text-[var(--nimi-text-muted)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={`transition-transform duration-200 ${showMore === 'medical' ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                {showMore === 'medical' ? i18nText('Allergy.form.hideMedicalDetails') : i18nText('Allergy.form.showMedicalDetails')}
              </button>

              {showMore === 'medical' && (
                <div className="mt-3 space-y-4">

                  {/* Treatment tags */}
                  <div>
                    <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.treatments')} <span className="font-normal">{i18nText('Allergy.form.multiSelectHint')}</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {TREATMENT_TAGS.map((t) => (
                        <button key={t} onClick={() => toggleTreatment(t)}
                          className={roundedChoiceClass(formTreatments.has(t))}>
                          {t}
                        </button>
                      ))}
                      <TextField value={formCustomTreatment} onChange={(e) => setFormCustomTreatment(e.target.value)}
                        placeholder={i18nText('Allergy.form.customTreatmentPlaceholder')}
                        className="w-28" />
                    </div>
                  </div>

                  {/* Category + Confirmed by + Status — unified grid */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.category')}</p>
                      <div className="flex flex-col gap-1">
                        {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
                          <button key={k} onClick={() => setFormCategory(k)}
                            className={roundedChoiceClass(formCategory === k, 'text-left')}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.confirmedBy')}</p>
                      <div className="flex flex-col gap-1">
                        {Object.entries(CONFIRMED_LABELS).map(([k, l]) => (
                          <button key={k} onClick={() => setFormConfirmedBy(formConfirmedBy === k ? '' : k)}
                            className={roundedChoiceClass(formConfirmedBy === k, 'text-left')}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.status')}</p>
                      <div className="flex flex-col gap-1">
                        {Object.entries(STATUS_LABELS).map(([k, l]) => (
                          <button key={k} onClick={() => setFormStatus(k)}
                            className={roundedChoiceClass(formStatus === k, 'text-left')}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <p className="text-[13px] mb-1.5 font-medium text-[var(--nimi-text-muted)]">{i18nText('Allergy.form.notes')}</p>
                    <TextareaField value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder={i18nText('Allergy.form.notesPlaceholder')}
                      className="w-full" rows={2} />
                  </div>
                </div>
              )}
            </div>
          </ModalContent>
          <ModalFooter>
            <Button onClick={resetForm} tone="ghost" size="md">{i18nText('Allergy.form.cancel')}</Button>
            <Button onClick={() => void handleSubmit()} disabled={!formAllergen.trim() || !formSeverity} tone="primary" size="md">{i18nText('Allergy.form.save')}</Button>
          </ModalFooter>
        </HealthRecordModalShell>
      )}

      {/* ── Active allergies ─────────────────────────────── */}
      {activeRecords.length > 0 && (
        <div className="mb-5">
          <h2 className="text-[14px] font-semibold mb-3 text-[var(--nimi-text-primary)]">
            {i18nText('Allergy.page.activeAllergensHeading', { count: activeRecords.length })}
          </h2>
          <div className="space-y-2">
            {activeRecords.map((r) => (
              <AllergyCard key={r.recordId} record={r} onMarkOutgrown={() => void handleMarkOutgrown(r)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Resolved / other ─────────────────────────────── */}
      {otherRecords.length > 0 && (
        <div className="mb-5">
          <h2 className="text-[14px] font-semibold mb-3 text-[var(--nimi-text-muted)]">{i18nText('Allergy.page.otherAllergensHeading', { count: otherRecords.length })}</h2>
          <div className="space-y-2">
            {otherRecords.map((r) => <AllergyCard key={r.recordId} record={r} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {records.length === 0 && !showForm && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="rounded-3xl p-8 text-center">
          <span className="text-[24px]">🤧</span>
          <p className="text-[14px] mt-2 font-medium text-[var(--nimi-text-primary)]">{i18nText('Allergy.page.emptyTitle')}</p>
          <p className="text-[13px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('Allergy.page.emptyHint')}</p>
        </Surface>
      )}
    </ProfileDetailShell>
  );
}

/* ── Allergy record card ─────────────────────────────────── */

function AllergyCard({ record: r, onMarkOutgrown }: { record: AllergyRecordRow; onMarkOutgrown?: () => void }) {
  // Parse structured notes
  const symptoms = r.notes?.match(new RegExp(`${ALLERGY_NOTE_MARKERS.symptoms} ([^|]+)`))?.[1];
  const treatments = r.notes?.match(new RegExp(`${ALLERGY_NOTE_MARKERS.treatments} ([^|]+)`))?.[1];
  const hasPhoto = r.notes?.includes(ALLERGY_NOTE_MARKERS.photo);

  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="md" className={`rounded-2xl border-l-4 ${severityBorderClass(r.severity)}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{r.allergen}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[12px] ${statusClass(r.status)}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[12px] ${severityClass(r.severity)}`}>{SEVERITY_LABELS[r.severity] ?? r.severity}</span>
            <span className="text-[12px] text-[var(--nimi-text-muted)]">{CATEGORY_LABELS[r.category] ?? r.category}</span>
            {hasPhoto && <span className="text-[12px]" title={i18nText('Allergy.card.hasPhoto')}>📷</span>}
          </div>
          {symptoms && <p className="text-[13px] mt-1.5 text-[var(--nimi-text-muted)]">{i18nText('Allergy.card.symptoms', { symptoms })}</p>}
          {treatments && <p className="text-[13px] mt-0.5 text-[var(--nimi-text-muted)]">{i18nText('Allergy.card.treatments', { treatments })}</p>}
          <p className="mt-1 text-[12px] text-[var(--nimi-text-muted)]">
            {r.diagnosedAt && `${r.diagnosedAt.split('T')[0]}`}
            {r.confirmedBy && ` · ${CONFIRMED_LABELS[r.confirmedBy] ?? r.confirmedBy}`}
          </p>
        </div>
        {r.status === 'active' && onMarkOutgrown && (
          <Button onClick={onMarkOutgrown} tone="secondary" size="sm" className="shrink-0 border-[color-mix(in_srgb,var(--nimi-status-success)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-success)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]">
            {i18nText('Allergy.card.markOutgrown')}
          </Button>
        )}
      </div>
    </Surface>
  );
}
