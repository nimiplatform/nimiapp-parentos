import { useCallback, useMemo, useState } from 'react';

import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { getAppSetting, setAppSetting } from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import { computeAgeMonths } from '../../app-shell/app-store.js';

import { analyzeMedicalEvents } from '../../engine/smart-alerts.js';
import type { MedicalAnalysis } from '../../engine/smart-alerts.js';
import { filterAIResponse } from '../../engine/ai-safety-filter.js';
import {
  runParentosTextGenerate,
} from '../settings/parentos-ai-runtime.js';
import { EVENT_TYPE_LABELS, SEVERITY_LABELS } from './medical-events-page-shared.js';
import type { MedicalEventsChildContext } from './medical-events-page-types.js';
import { i18nText } from '../../i18n/index.js';

export function useMedicalEventsInsights(
  child: MedicalEventsChildContext | undefined,
  events: MedicalEventRow[],
) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [eventAiLoading, setEventAiLoading] = useState<string | null>(null);
  const [eventAiResult, setEventAiResult] = useState<Record<string, string>>({});

  const analysis: MedicalAnalysis | null = useMemo(
    () => (events.length > 0 ? analyzeMedicalEvents(events) : null),
    [events],
  );

  const generateAIInsight = useCallback(async (skipCache = false) => {
    if (!child || !analysis || events.length === 0) return;
    const cacheKeyStr = `medical_insight_${child.childId}`;

    if (!skipCache) {
      try {
        const cached = await getAppSetting(cacheKeyStr);
        if (cached) {
          const parsed = JSON.parse(cached) as { text: string; ts: string };
          if (Date.now() - new Date(parsed.ts).getTime() < 24 * 60 * 60 * 1000) {
            setAiInsight(parsed.text);
            return;
          }
        }
      } catch {
        // ignore cache read failures
      }
    }

    setAiLoading(true);
    try {
      const itemSeparator = i18nText('MedicalEvents.aiPrompt.itemSeparator');
      const diagSummary = analysis.diagnoses.slice(0, 10)
        .map((d) => i18nText('MedicalEvents.aiPrompt.diagnosisItem', {
          diagnosis: d.diagnosis,
          count: d.count,
          lastDate: d.lastDate.split('T')[0],
        }))
        .join(itemSeparator);
      const medSummary = analysis.medications.slice(0, 10)
        .map((m) => i18nText(m.dosage ? 'MedicalEvents.aiPrompt.medicationItemWithDosage' : 'MedicalEvents.aiPrompt.medicationItem', {
          name: m.name,
          count: m.count,
          dosage: m.dosage,
        }))
        .join(itemSeparator);
      const alertSummary = analysis.alerts
        .map((a) => `[${a.level}] ${a.title}`)
        .join(itemSeparator);

      const ageMonths = computeAgeMonths(child.birthDate);
      const ageLabel = i18nText('Profile.age.yearsMonths', {
        years: Math.floor(ageMonths / 12),
        months: ageMonths % 12,
      });
      const gender = child.gender === 'female'
        ? i18nText('MedicalEvents.aiPrompt.genderFemale')
        : i18nText('MedicalEvents.aiPrompt.genderMale');
      const prompt = [
        i18nText('MedicalEvents.aiPrompt.aggregateRole'),
        i18nText('MedicalEvents.aiPrompt.aggregateTask'),
        i18nText('MedicalEvents.aiPrompt.requirementsTitle'),
        i18nText('MedicalEvents.aiPrompt.aggregateVisibleOnly'),
        i18nText('MedicalEvents.aiPrompt.patternBoundary'),
        i18nText('MedicalEvents.aiPrompt.noTreatmentJudgment'),
        i18nText('MedicalEvents.aiPrompt.gentleTone'),
        i18nText('MedicalEvents.aiPrompt.outputOnly'),
        '',
        i18nText('MedicalEvents.aiPrompt.childLineWithGender', { name: child.displayName, ageLabel, gender }),
        i18nText('MedicalEvents.aiPrompt.totalEvents', { count: analysis.totalEvents }),
        i18nText('MedicalEvents.aiPrompt.diagnosisSummary', { summary: diagSummary || i18nText('MedicalEvents.aiPrompt.none') }),
        i18nText('MedicalEvents.aiPrompt.medicationSummary', { summary: medSummary || i18nText('MedicalEvents.aiPrompt.none') }),
        i18nText('MedicalEvents.aiPrompt.alertSummary', { summary: alertSummary || i18nText('MedicalEvents.aiPrompt.none') }),
        i18nText('MedicalEvents.aiPrompt.frequentHospitals', {
          hospitals: analysis.frequentHospitals.join(itemSeparator) || i18nText('MedicalEvents.aiPrompt.notRecorded'),
        }),
      ].join('\n');

      const output = await runParentosTextGenerate({
        surfaceId: 'parentos.medical.smart-insight',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        defaults: { temperature: 0.3, maxTokens: 600 },
      });
      if (!output.ok) {
        throw output.error.cause || new Error(output.error.message);
      }

      const filtered = filterAIResponse(output.text);
      const text = filtered.safe ? filtered.filtered : i18nText('MedicalEvents.ai.filteredFallback');
      setAiInsight(text);

      try {
        await setAppSetting(cacheKeyStr, JSON.stringify({ text, ts: isoNow() }), isoNow());
      } catch {
        // ignore cache write failures
      }
    } catch {
      setAiInsight(null);
    } finally {
      setAiLoading(false);
    }
  }, [analysis, child, events.length]);

  const analyzeEvent = useCallback(async (event: MedicalEventRow) => {
    if (!child) return;

    setEventAiLoading(event.eventId);
    try {
      const ageMonths = computeAgeMonths(child.birthDate);
      const ageLabel = i18nText('Profile.age.yearsMonths', {
        years: Math.floor(ageMonths / 12),
        months: ageMonths % 12,
      });
      const prompt = [
        i18nText('MedicalEvents.aiPrompt.eventTask'),
        i18nText('MedicalEvents.aiPrompt.eventRequirement'),
        '',
        i18nText('MedicalEvents.aiPrompt.childLine', { name: child.displayName, ageLabel }),
        i18nText('MedicalEvents.aiPrompt.eventType', { type: EVENT_TYPE_LABELS[event.eventType] ?? event.eventType }),
        i18nText('MedicalEvents.aiPrompt.diagnosisOrSymptom', { title: event.title }),
        i18nText('MedicalEvents.aiPrompt.date', { date: event.eventDate.split('T')[0] }),
        event.severity ? i18nText('MedicalEvents.aiPrompt.severity', { severity: SEVERITY_LABELS[event.severity] ?? event.severity }) : '',
        event.hospital ? i18nText('MedicalEvents.aiPrompt.hospital', { hospital: event.hospital }) : '',
        event.medication ? i18nText(event.dosage ? 'MedicalEvents.aiPrompt.medicationWithDosage' : 'MedicalEvents.aiPrompt.medication', {
          medication: event.medication,
          dosage: event.dosage,
        }) : '',
        event.notes ? i18nText('MedicalEvents.aiPrompt.notes', { notes: event.notes }) : '',
      ].filter(Boolean).join('\n');

      const output = await runParentosTextGenerate({
        surfaceId: 'parentos.medical.event-analysis',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        defaults: { temperature: 0.3, maxTokens: 300 },
      });
      if (!output.ok) {
        throw output.error.cause || new Error(output.error.message);
      }

      const filtered = filterAIResponse(output.text);
      setEventAiResult((prev) => ({
        ...prev,
        [event.eventId]: filtered.safe ? filtered.filtered : i18nText('MedicalEvents.ai.unavailable'),
      }));
    } catch {
      setEventAiResult((prev) => ({
        ...prev,
        [event.eventId]: i18nText('MedicalEvents.ai.retryLater'),
      }));
    } finally {
      setEventAiLoading(null);
    }
  }, [child]);

  const closeEventAnalysis = useCallback((eventId: string) => {
    setEventAiResult((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }, []);

  return {
    analysis,
    showAnalysis,
    setShowAnalysis,
    aiInsight,
    aiLoading,
    eventAiLoading,
    eventAiResult,
    generateAIInsight,
    analyzeEvent,
    closeEventAnalysis,
  };
}
