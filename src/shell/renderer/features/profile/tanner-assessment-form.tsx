import { useState, type ReactNode } from 'react';
import { Button, DatePicker, TextField } from '@nimiplatform/kit/ui';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertMeasurement, insertTannerAssessment } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import { TannerStageSelector } from './tanner-stage-selector.js';
import {
  ASSESSED_BY_OPTIONS,
  BREAST_STAGES,
  GENITAL_STAGES,
  formatAssessedBy,
  pubicHairStages,
  type MenarcheStatus,
  type StageDesc,
} from './tanner-page-shared.js';
import {
  ChipGroup,
  type ChipOption,
  FormField,
  FormGrid,
  HealthRecordModalShell,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const NUMBER_INPUT_CLASS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

type TannerAssessmentFormProps = {
  isFemale: boolean;
  bgLabel: string;
  bgStages: StageDesc[];
  phStages: StageDesc[];
  formAssessedAt: string;
  setFormAssessedAt: (value: string) => void;
  formBG: number;
  setFormBG: (value: number) => void;
  formPH: number;
  setFormPH: (value: number) => void;
  formAssessedBy: string;
  setFormAssessedBy: (value: string) => void;
  formNotes: string;
  setFormNotes: (value: string) => void;
  formBoneAge: string;
  setFormBoneAge: (value: string) => void;
  formBodyFat: string;
  setFormBodyFat: (value: string) => void;
  formMenarcheStatus: MenarcheStatus;
  setFormMenarcheStatus: (value: MenarcheStatus) => void;
  formMenarcheDate: string;
  setFormMenarcheDate: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

const ASSESSED_BY_CHIPS: ChipOption<string>[] = ASSESSED_BY_OPTIONS.map((value) => ({
  value,
  label: formatAssessedBy(value),
}));

const MENARCHE_STATUS_CHIPS: ChipOption<MenarcheStatus>[] = [
  { value: 'not_yet', label: i18nText('Tanner.form.menarcheNotYet') },
  { value: 'occurred', label: i18nText('Tanner.form.menarcheOccurred') },
];

// @nimi-authority: rule.parentos.prof.r012
export function TannerAssessmentForm({
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
  onClose,
  onSave,
}: TannerAssessmentFormProps) {
  return (
    <HealthRecordModalShell open size="XL" onClose={onClose}>
      <ModalHeader title={i18nText('Tanner.form.title')} icon="🌱" onClose={onClose} />
      <ModalContent>
        <TannerFormFields
          isFemale={isFemale}
          bgLabel={bgLabel}
          bgStages={bgStages}
          phStages={phStages}
          formAssessedAt={formAssessedAt}
          setFormAssessedAt={setFormAssessedAt}
          formBG={formBG}
          setFormBG={setFormBG}
          formPH={formPH}
          setFormPH={setFormPH}
          formAssessedBy={formAssessedBy}
          setFormAssessedBy={setFormAssessedBy}
          formNotes={formNotes}
          setFormNotes={setFormNotes}
          formBoneAge={formBoneAge}
          setFormBoneAge={setFormBoneAge}
          formBodyFat={formBodyFat}
          setFormBodyFat={setFormBodyFat}
          formMenarcheStatus={formMenarcheStatus}
          setFormMenarcheStatus={setFormMenarcheStatus}
          formMenarcheDate={formMenarcheDate}
          setFormMenarcheDate={setFormMenarcheDate}
        />
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Tanner.form.cancel')}</Button>
        <Button type="button" onClick={onSave} tone="primary" size="md">{i18nText('Tanner.form.save')}</Button>
      </ModalFooter>
    </HealthRecordModalShell>
  );
}

type TannerFormFieldsProps = Omit<TannerAssessmentFormProps, 'onClose' | 'onSave'>;

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
      <FormGrid cols={2}>
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

      <FormGrid cols={2} gap={4}>
        <TannerStageSelector stages={bgStages} value={formBG} onChange={setFormBG} label={bgLabel} />
        <TannerStageSelector stages={phStages} value={formPH} onChange={setFormPH} label={i18nText('Tanner.form.pubicHairStage')} />
      </FormGrid>

      {isFemale ? (
        <FormGrid cols={2}>
          <FormField label={i18nText('Tanner.form.menarcheStatus')}>
            <ChipGroup
              options={MENARCHE_STATUS_CHIPS}
              value={formMenarcheStatus}
              onChange={(value) => {
                setFormMenarcheStatus(value);
                if (value !== 'occurred') setFormMenarcheDate('');
              }}
              layout="fill"
              activeColor="var(--nimi-status-info)"
            />
          </FormField>
          {formMenarcheStatus === 'occurred' ? (
            <FormField label={i18nText('Tanner.form.menarcheDate')}>
              <DatePicker value={formMenarcheDate} onChange={setFormMenarcheDate} className="h-12" />
            </FormField>
          ) : null}
        </FormGrid>
      ) : null}

      <FormGrid cols={2}>
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
};

export function TannerCaptureContent({ child, onSaved, onClose, headerTrailing, linkedReminder }: TannerCaptureContentProps) {
  const isFemale = child.gender === 'female';
  const bgLabel = isFemale ? i18nText('Tanner.page.breastStageLabel') : i18nText('Tanner.page.genitalStageLabel');
  const bgStages: StageDesc[] = isFemale ? BREAST_STAGES : GENITAL_STAGES;
  const phStages: StageDesc[] = pubicHairStages(isFemale);

  const [assessedAt, setAssessedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [bg, setBg] = useState(1);
  const [ph, setPh] = useState(1);
  const [assessedBy, setAssessedBy] = useState<string>('parent');
  const [notes, setNotes] = useState('');
  const [boneAge, setBoneAge] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [menarcheStatus, setMenarcheStatus] = useState<MenarcheStatus>('not_yet');
  const [menarcheDate, setMenarcheDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!assessedAt || bg < 1 || bg > 5 || ph < 1 || ph > 5) return;
    if (isFemale && menarcheStatus === 'occurred' && !menarcheDate) return;
    setSaving(true);
    const now = isoNow();
    const ageMonths = computeAgeMonthsAt(child.birthDate, assessedAt);
    const linkedReminderStateId = linkedReminder?.stateId ?? null;
    const linkedReminderRuleId = linkedReminder?.ruleId ?? null;
    try {
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
      if (boneAge.trim()) {
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
      }
      if (bodyFat.trim()) {
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
      await onSaved();
      onClose();
    } catch {
      /* bridge unavailable */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title={i18nText('Tanner.form.captureTitle')} icon="🌱" onClose={onClose} trailing={headerTrailing} />
      <ModalContent>
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
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Tanner.form.cancel')}</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('Tanner.form.saving') : i18nText('Tanner.form.save')}
        </Button>
      </ModalFooter>
    </>
  );
}
