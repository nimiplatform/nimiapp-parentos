import { useCallback, useMemo, useRef, useState } from 'react';

import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertMedicalEvent, getMedicalEvents, updateMedicalEvent } from '../../bridge/sqlite-bridge.js';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';

import { LAB_ITEMS, parseLabReport, type LabReportData } from './medical-events-page-shared.js';
import type {
  MedicalEventsChildContext,
  MedicalEventsFormMedication,
} from './medical-events-page-types.js';
import { i18nText } from '../../i18n/index.js';


export function useMedicalEventsFormState(
  child: MedicalEventsChildContext | undefined,
  events: MedicalEventRow[],
  setEvents: (events: MedicalEventRow[]) => void,
) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [formEventType, setFormEventType] = useState('visit');
  const [formTitle, setFormTitle] = useState('');
  const [formEventDate, setFormEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState('');
  const [formSeverity, setFormSeverity] = useState('');
  const [formResult, setFormResult] = useState('');
  const [formHospital, setFormHospital] = useState('');
  const [formMedication, setFormMedication] = useState('');
  const [formDosage, setFormDosage] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formLabValues, setFormLabValues] = useState<Record<string, string>>({});
  const [formSymptomTags, setFormSymptomTags] = useState<Set<string>>(new Set());
  const [formMeds, setFormMeds] = useState<MedicalEventsFormMedication[]>([]);
  const [formShowEndDate, setFormShowEndDate] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrImageName, setOcrImageName] = useState<string | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setFormEventType('visit');
    setFormTitle('');
    setFormEventDate(new Date().toISOString().slice(0, 10));
    setFormEndDate('');
    setFormSeverity('');
    setFormResult('');
    setFormHospital('');
    setFormMedication('');
    setFormDosage('');
    setFormNotes('');
    setFormLabValues({});
    setFormSymptomTags(new Set());
    setFormMeds([]);
    setFormShowEndDate(false);
    setSubmitError(null);
    setShowForm(false);
  }, []);

  const closeForm = useCallback(() => {
    setEditingEventId(null);
    resetForm();
  }, [resetForm]);

  const handleOCRUpload = useCallback((file: File) => {
    // Vision/OCR intake has no admitted Nimi App Access operation; fail
    // closed with the unavailable copy and keep manual entry as the path.
    setOcrImageName(file.name);
    setOcrLoading(false);
    setOcrError(i18nText('MedicalEvents.form.ocrRuntimeUnavailable'));
  }, []);

  const submitForm = useCallback(async () => {
    if (!child) return;

    const isLab = formEventType === 'lab-report';
    const effectiveTitle = isLab ? i18nText('MedicalEvents.type.labReport') : formTitle.trim();
    if (!isLab && !formTitle.trim()) {
      setSubmitError(i18nText('MedicalEvents.form.titleRequired'));
      return;
    }
    if (!formEventDate) {
      setSubmitError(i18nText('MedicalEvents.form.dateRequired'));
      return;
    }

    setSubmitError(null);
    setSaving(true);

    let effectiveNotes = formNotes || null;
    if (isLab) {
      const labValues: Record<string, number | null> = {};
      for (const item of LAB_ITEMS) {
        const value = formLabValues[item.key];
        labValues[item.key] = value ? parseFloat(value) : null;
      }
      effectiveNotes = JSON.stringify({ type: 'lab-report', values: labValues } satisfies LabReportData);
    }

    const symptomStr = formSymptomTags.size > 0 ? [...formSymptomTags].join(i18nText('Common.list.separator')) : '';
    const fullTitle = [effectiveTitle, symptomStr].filter(Boolean).join(' — ');
    const medicationSummary = formMeds.length > 0
      ? formMeds
        .filter((medication) => medication.name.trim())
        .map((medication) => {
          const parts = [medication.name.trim()];
          if (medication.dose) parts.push(`${medication.dose}${medication.unit}`);
          if (medication.frequency) parts.push(medication.frequency);
          if (medication.days) parts.push(i18nText('MedicalEvents.form.medicationDays', { days: medication.days }));
          return parts.join(' ');
        })
        .join('；')
      : formMedication || null;

    try {
      if (editingEventId) {
        await updateMedicalEvent({
          eventId: editingEventId,
          title: isLab ? i18nText('MedicalEvents.type.labReport') : formTitle.trim(),
          eventDate: formEventDate,
          endDate: formEndDate || null,
          severity: formSeverity || null,
          result: formResult || null,
          hospital: formHospital || null,
          medication: isLab ? null : (formMedication || null),
          dosage: isLab ? null : (formDosage || null),
          notes: effectiveNotes,
          photoPath: null,
          now: isoNow(),
        });
      } else {
        const now = isoNow();
        await insertMedicalEvent({
          eventId: ulid(),
          childId: child.childId,
          eventType: formEventType,
          title: fullTitle || effectiveTitle,
          eventDate: formEventDate,
          endDate: formShowEndDate && formEndDate ? formEndDate : null,
          ageMonths: computeAgeMonthsAt(child.birthDate, formEventDate),
          severity: formSeverity || null,
          result: formResult || null,
          hospital: formHospital || null,
          medication: isLab ? null : (medicationSummary || null),
          dosage: isLab ? null : (formDosage || null),
          notes: effectiveNotes,
          photoPath: null,
          now,
        });
      }

      const updatedEvents = await getMedicalEvents(child.childId);
      setEvents(updatedEvents);
      setEditingEventId(null);
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitError(i18nText('MedicalEvents.form.saveFailed', { message }));
    } finally {
      setSaving(false);
    }
  }, [
    child,
    editingEventId,
    formDosage,
    formEndDate,
    formEventDate,
    formEventType,
    formHospital,
    formLabValues,
    formMeds,
    formMedication,
    formNotes,
    formResult,
    formSeverity,
    formShowEndDate,
    formSymptomTags,
    formTitle,
    resetForm,
    setEvents,
  ]);

  const startEditing = useCallback((event: MedicalEventRow) => {
    setEditingEventId(event.eventId);
    setFormEventType(event.eventType);
    setFormTitle(event.title);
    setFormEventDate(event.eventDate.split('T')[0] ?? '');
    setFormEndDate(event.endDate?.split('T')[0] ?? '');
    setFormSeverity(event.severity ?? '');
    setFormResult(event.result ?? '');
    setFormHospital(event.hospital ?? '');
    setFormMedication(event.medication ?? '');
    setFormDosage(event.dosage ?? '');
    setFormNotes(event.notes ?? '');

    const labData = parseLabReport(event.notes);
    if (labData) {
      const nextLabValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(labData.values)) {
        if (value != null) nextLabValues[key] = String(value);
      }
      setFormLabValues(nextLabValues);
    } else {
      setFormLabValues({});
    }

    setSubmitError(null);
    setShowForm(true);
  }, []);

  const historyDrugs = useMemo(() => {
    const drugMap = new Map<string, { name: string; unit?: string; frequency?: string }>();
    for (const event of events) {
      if (!event.medication) continue;
      for (const chunk of event.medication.split('；')) {
        const name = chunk.split(/\s/)[0]?.trim();
        if (name && !drugMap.has(name)) drugMap.set(name, { name });
      }
    }
    return [...drugMap.values()];
  }, [events]);

  return {
    showForm,
    setShowForm,
    saving,
    submitError,
    editingEventId,
    formEventType,
    setFormEventType,
    formTitle,
    setFormTitle,
    formEventDate,
    setFormEventDate,
    formEndDate,
    setFormEndDate,
    formSeverity,
    setFormSeverity,
    formResult,
    setFormResult,
    formHospital,
    setFormHospital,
    formMedication,
    setFormMedication,
    formDosage,
    setFormDosage,
    formNotes,
    setFormNotes,
    formLabValues,
    setFormLabValues,
    formSymptomTags,
    setFormSymptomTags,
    formMeds,
    setFormMeds,
    formShowEndDate,
    setFormShowEndDate,
    ocrLoading,
    ocrError,
    ocrImageName,
    ocrInputRef,
    historyDrugs,
    closeForm,
    handleOCRUpload,
    submitForm,
    startEditing,
  };
}
