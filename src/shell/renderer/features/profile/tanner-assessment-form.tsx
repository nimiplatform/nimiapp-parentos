import { useRef, useState, type ReactNode } from 'react';
import { Button, DatePicker, TextField } from '@nimiplatform/kit/ui';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertMeasurement, insertTannerAssessment } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import { TannerStageSelector } from './tanner-stage-selector.js';
import {
  ASSESSED_BY_OPTIONS,
  formatAssessedBy,
  primaryStages,
  pubicHairStages,
  type MenarcheStatus,
  type StageDesc,
} from './tanner-page-shared.js';
import {
  ChipGroup,
  type ChipOption,
  FormField,
  FormGrid,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';

const NUMBER_INPUT_CLASS =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

type TannerFormFieldsProps = {
  isFemale: boolean;
  bgLabel: string;
  bgStages: StageDesc[];
  phStages: StageDesc[];
  formAssessedAt: string;
  setFormAssessedAt: (value: string) => void;
  formBG: number | null;
  setFormBG: (value: number) => void;
  formPH: number | null;
  setFormPH: (value: number) => void;
  formAssessedBy: string;
  setFormAssessedBy: (value: string) => void;
  formNotes: string;
  setFormNotes: (value: string) => void;
  formBoneAge: string;
  setFormBoneAge: (value: string) => void;
  formBodyFat: string;
  setFormBodyFat: (value: string) => void;
  formMenarcheStatus: MenarcheStatus | null;
  setFormMenarcheStatus: (value: MenarcheStatus | null) => void;
  formMenarcheDate: string;
  setFormMenarcheDate: (value: string) => void;
};

const ASSESSED_BY_CHIPS: ChipOption<string>[] = ASSESSED_BY_OPTIONS.map((value) => ({
  value,
  label: formatAssessedBy(value),
}));

const MENARCHE_STATUS_CHIPS: ChipOption<MenarcheStatus | 'unrecorded'>[] = [
  { value: 'unrecorded', label: i18nText('Tanner.redesign.unrecorded') },
  { value: 'not_yet', label: i18nText('Tanner.form.menarcheNotYet') },
  { value: 'occurred', label: i18nText('Tanner.form.menarcheOccurred') },
];

function TannerFormFields({
  isFemale,
  bgLabel,
  bgStages,
  phStages,
  formAssessedAt,
  setFormAssessedAt,
  formBG,
  setFormBG,
  formPH,
  setFormPH,
  formAssessedBy,
  setFormAssessedBy,
  formNotes,
  setFormNotes,
  formBoneAge,
  setFormBoneAge,
  formBodyFat,
  setFormBodyFat,
  formMenarcheStatus,
  setFormMenarcheStatus,
  formMenarcheDate,
  setFormMenarcheDate,
}: TannerFormFieldsProps) {
  return (
    <div className="space-y-5">
      <FormGrid className="!grid-cols-1 sm:!grid-cols-2" cols={2}>
        <FormField label={i18nText('Tanner.form.assessedAt')}>
          <DatePicker value={formAssessedAt} onChange={setFormAssessedAt} className="h-12" />
        </FormField>
        <FormField label={i18nText('Tanner.form.assessedBy')}>
          <ChipGroup
            options={ASSESSED_BY_CHIPS}
            value={formAssessedBy}
            onChange={setFormAssessedBy}
            layout="fill"
            activeColor="var(--nimi-status-info)"
          />
        </FormField>
      </FormGrid>

      <FormGrid className="!grid-cols-1 sm:!grid-cols-2" cols={2} gap={4}>
        <TannerStageSelector
          stages={bgStages}
          value={formBG}
          onChange={setFormBG}
          label={bgLabel}
        />
        <TannerStageSelector
          stages={phStages}
          value={formPH}
          onChange={setFormPH}
          label={i18nText('Tanner.form.pubicHairStage')}
        />
      </FormGrid>

      {isFemale ? (
        <FormGrid className="!grid-cols-1 sm:!grid-cols-2" cols={2}>
          <FormField label={i18nText('Tanner.form.menarcheStatus')}>
            <ChipGroup
              options={MENARCHE_STATUS_CHIPS}
              value={formMenarcheStatus ?? 'unrecorded'}
              onChange={(value) => {
                setFormMenarcheStatus(value === 'unrecorded' ? null : value);
                if (value !== 'occurred') setFormMenarcheDate('');
              }}
              layout="fill"
              activeColor="var(--nimi-status-info)"
            />
          </FormField>
          {formMenarcheStatus === 'occurred' ? (
            <FormField label={i18nText('Tanner.form.menarcheDate')}>
              <DatePicker
                value={formMenarcheDate}
                onChange={setFormMenarcheDate}
                className="h-12"
              />
            </FormField>
          ) : null}
        </FormGrid>
      ) : null}

      <FormGrid className="!grid-cols-1 sm:!grid-cols-2" cols={2}>
        <FormField label={i18nText('Tanner.form.boneAge')}>
          <TextField
            type="number"
            step="0.1"
            value={formBoneAge}
            onChange={(event) => setFormBoneAge(event.target.value)}
            placeholder={i18nText('Tanner.form.boneAgePlaceholder')}
            className="w-full min-h-12"
            inputClassName={NUMBER_INPUT_CLASS}
          />
        </FormField>
        <FormField label={i18nText('Tanner.form.bodyFat')}>
          <TextField
            type="number"
            step="0.1"
            value={formBodyFat}
            onChange={(event) => setFormBodyFat(event.target.value)}
            placeholder={i18nText('Tanner.form.bodyFatPlaceholder')}
            className="w-full min-h-12"
            inputClassName={NUMBER_INPUT_CLASS}
          />
        </FormField>
      </FormGrid>

      <FormField label={i18nText('Tanner.form.notes')}>
        <TextField
          value={formNotes}
          onChange={(event) => setFormNotes(event.target.value)}
          placeholder={i18nText('Tanner.form.notesPlaceholder')}
          className="w-full min-h-12"
        />
      </FormField>
    </div>
  );
}

type TannerCaptureContentProps = {
  child: { childId: string; birthDate: string; gender: 'male' | 'female' };
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  /** Optional trailing slot in the header (e.g., milestone/tanner tab switcher). */
  headerTrailing?: ReactNode;
  linkedReminder?: LinkedHealthRecordReminder | null;
  onSavingChange?: (saving: boolean) => void;
};

// @nimi-authority: rule.parentos.prof.r012
export function TannerCaptureContent({
  child,
  onSaved,
  onClose,
  headerTrailing,
  linkedReminder,
  onSavingChange,
}: TannerCaptureContentProps) {
  const isFemale = child.gender === 'female';
  const bgLabel = isFemale
    ? i18nText('Tanner.page.breastStageLabel')
    : i18nText('Tanner.page.genitalStageLabel');
  const bgStages: StageDesc[] = primaryStages(isFemale);
  const phStages: StageDesc[] = pubicHairStages(isFemale);

  const [assessedAt, setAssessedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [bg, setBg] = useState<number | null>(null);
  const [ph, setPh] = useState<number | null>(null);
  const [assessedBy, setAssessedBy] = useState<string>('parent');
  const [notes, setNotes] = useState('');
  const [boneAge, setBoneAge] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [menarcheStatus, setMenarcheStatus] = useState<MenarcheStatus | null>(null);
  const [menarcheDate, setMenarcheDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [locked, setLocked] = useState(false);

  const handleSubmit = async () => {
    if (inFlight.current) return;
    if (
      !assessedAt ||
      assessedAt < child.birthDate.slice(0, 10) ||
      assessedAt > new Date().toISOString().slice(0, 10)
    ) {
      setError(i18nText('Tanner.redesign.invalidDate'));
      return;
    }
    if (
      bg == null ||
      ph == null ||
      !Number.isInteger(bg) ||
      !Number.isInteger(ph) ||
      bg < 1 ||
      bg > 5 ||
      ph < 1 ||
      ph > 5
    ) {
      setError(i18nText('Tanner.redesign.selectStages'));
      return;
    }
    if (
      isFemale &&
      menarcheStatus === 'occurred' &&
      (!menarcheDate || menarcheDate < child.birthDate.slice(0, 10) || menarcheDate > assessedAt)
    ) {
      setError(i18nText('Tanner.redesign.invalidMenarcheDate'));
      return;
    }
    if (
      [boneAge, bodyFat].some(
        (value) => value.trim() && (!Number.isFinite(Number(value)) || Number(value) <= 0),
      ) ||
      Number(bodyFat) > 100
    ) {
      setError(i18nText('Tanner.redesign.invalidMeasurement'));
      return;
    }
    inFlight.current = true;
    setError(null);
    setSaving(true);
    onSavingChange?.(true);
    const now = isoNow();
    const ageMonths = computeAgeMonthsAt(child.birthDate, assessedAt);
    const linkedReminderStateId = linkedReminder?.stateId ?? null;
    const linkedReminderRuleId = linkedReminder?.ruleId ?? null;
    try {
      if (!completed.current.has('assessment')) {
        await insertTannerAssessment({
          assessmentId: ulid(),
          childId: child.childId,
          assessedAt,
          ageMonths,
          breastOrGenitalStage: bg,
          pubicHairStage: ph,
          assessedBy: assessedBy || null,
          notes: notes.trim() || null,
          now,
          linkedReminderStateId,
          linkedReminderRuleId,
          menarcheStatus: isFemale ? menarcheStatus : null,
          menarcheDate: isFemale && menarcheStatus === 'occurred' ? menarcheDate : null,
        });
        completed.current.add('assessment');
        setLocked(true);
      }
      if (boneAge.trim() && !completed.current.has('bone')) {
        await insertMeasurement({
          measurementId: ulid(),
          childId: child.childId,
          typeId: 'bone-age',
          value: parseFloat(boneAge),
          measuredAt: assessedAt,
          ageMonths,
          percentile: null,
          source: 'manual',
          notes: null,
          now,
          linkedReminderStateId,
          linkedReminderRuleId,
        });
        completed.current.add('bone');
      }
      if (bodyFat.trim() && !completed.current.has('fat')) {
        await insertMeasurement({
          measurementId: ulid(),
          childId: child.childId,
          typeId: 'body-fat-percentage',
          value: parseFloat(bodyFat),
          measuredAt: assessedAt,
          ageMonths,
          percentile: null,
          source: 'manual',
          notes: null,
          now,
          linkedReminderStateId,
          linkedReminderRuleId,
        });
      }
      completed.current.add('fat');
      await onSaved();
      onClose();
    } catch {
      setError(
        i18nText(
          completed.current.size > 0
            ? 'Tanner.redesign.partialSaveError'
            : 'Tanner.redesign.saveError',
        ),
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  return (
    <>
      <ModalHeader
        title={i18nText('Tanner.form.captureTitle')}
        icon="🌱"
        onClose={() => {
          if (!inFlight.current) onClose();
        }}
        trailing={headerTrailing}
      />
      <ModalContent>
        <p className="mb-4 text-sm leading-6 text-[var(--nimi-text-secondary)]">
          {i18nText('Tanner.redesign.formIntro')}
        </p>
        {error ? (
          <p role="alert" className="mb-4 text-sm text-[var(--nimi-status-danger)]">
            {error}
          </p>
        ) : null}
        <fieldset disabled={saving || locked}>
          <TannerFormFields
            isFemale={isFemale}
            bgLabel={bgLabel}
            bgStages={bgStages}
            phStages={phStages}
            formAssessedAt={assessedAt}
            setFormAssessedAt={setAssessedAt}
            formBG={bg}
            setFormBG={setBg}
            formPH={ph}
            setFormPH={setPh}
            formAssessedBy={assessedBy}
            setFormAssessedBy={setAssessedBy}
            formNotes={notes}
            setFormNotes={setNotes}
            formBoneAge={boneAge}
            setFormBoneAge={setBoneAge}
            formBodyFat={bodyFat}
            setFormBodyFat={setBodyFat}
            formMenarcheStatus={menarcheStatus}
            setFormMenarcheStatus={setMenarcheStatus}
            formMenarcheDate={menarcheDate}
            setFormMenarcheDate={setMenarcheDate}
          />
        </fieldset>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} disabled={saving} tone="ghost" size="md">
          {i18nText('Tanner.form.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          tone="primary"
          size="md"
        >
          {saving ? i18nText('Tanner.form.saving') : i18nText('Tanner.form.save')}
        </Button>
      </ModalFooter>
    </>
  );
}
