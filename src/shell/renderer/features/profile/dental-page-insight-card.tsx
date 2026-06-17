import { Surface } from '@nimiplatform/kit/ui';
import { useMemo } from 'react';
import type { DentalRecordRow } from '../../bridge/sqlite-bridge.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';
import {
  computeDentalOverviewStates,
  parseDentalToothIds,
} from './dental-page-domain.js';
import { i18nText } from '../../i18n/index.js';


interface DentalInsightCardProps {
  childName: string;
  ageLabel: string;
  records: DentalRecordRow[];
}

type ChipTone = 'warn' | 'info' | 'ok' | 'alert';

interface Chip {
  label: string;
  tone: ChipTone;
}

const CHIP_CLASSES: Record<ChipTone, { chip: string; dot: string }> = {
  warn: {
    chip: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_15%,transparent)] text-[var(--nimi-status-warning)]',
    dot: 'bg-[var(--nimi-status-warning)]',
  },
  info: {
    chip: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_15%,transparent)] text-[var(--nimi-status-info)]',
    dot: 'bg-[var(--nimi-status-info)]',
  },
  ok: {
    chip: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_15%,transparent)] text-[var(--nimi-status-success)]',
    dot: 'bg-[var(--nimi-status-success)]',
  },
  alert: {
    chip: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_15%,transparent)] text-[var(--nimi-status-danger)]',
    dot: 'bg-[var(--nimi-status-danger)]',
  },
};

const DENTAL_CHECKUP_INTERVAL_MONTHS = requiredDentalFollowupIntervalMonths('PO-DEN-FOLLOWUP-CHECKUP');

function requiredDentalFollowupIntervalMonths(ruleId: string) {
  const rule = REMINDER_RULES.find((candidate) => candidate.ruleId === ruleId);
  if (!rule?.repeatRule || rule.repeatRule.cadenceUnit !== 'month') {
    throw new Error(`Dental insight requires ${ruleId} to resolve to a month-cadence reminder rule`);
  }
  return rule.repeatRule.interval;
}

function isPermanentId(id: string): boolean {
  const n = Number(id);
  return Number.isFinite(n) && ((n >= 11 && n <= 18) || (n >= 21 && n <= 28) || (n >= 31 && n <= 38) || (n >= 41 && n <= 48));
}

export function DentalInsightCard({ childName, ageLabel, records }: DentalInsightCardProps) {
  const stats = useMemo(() => {
    const eruptedToothIds = new Set(
      records.filter((r) => r.eventType === 'eruption').flatMap((r) => parseDentalToothIds(r.toothId)),
    );
    const permanentPresent = [...eruptedToothIds].filter(isPermanentId).length;
    const primaryPresent = eruptedToothIds.size - permanentPresent;
    const cariesCount = records.filter((r) => r.eventType === 'caries').length;

    const states = computeDentalOverviewStates(records);
    let concernPosition: string | null = null;
    for (const [pid, cell] of states.entries()) {
      if (cell.eruption === 'lost_waiting') { concernPosition = pid; break; }
    }
    if (!concernPosition) {
      for (const [pid, cell] of states.entries()) {
        if (cell.health === 'caries') { concernPosition = pid; break; }
      }
    }

    const latestCheckup = records
      .filter((r) => r.eventType === 'checkup' || r.eventType === 'ortho-assessment' || r.eventType === 'cleaning')
      .map((r) => r.eventDate)
      .sort()
      .at(-1);
    const nextCheckDate = (() => {
      const base = latestCheckup ? new Date(latestCheckup) : new Date();
      base.setMonth(base.getMonth() + DENTAL_CHECKUP_INTERVAL_MONTHS);
      return base;
    })();

    const hasCleaning = records.some((r) => r.eventType === 'cleaning');
    const hasFluoride = records.some((r) => r.eventType === 'fluoride');

    return {
      eruptedCount: eruptedToothIds.size,
      permanentPresent,
      primaryPresent,
      cariesCount,
      concernPosition,
      concernKind:
        concernPosition && states.get(concernPosition)?.health === 'caries' ? 'caries' :
        concernPosition ? 'lost_waiting' : null,
      nextCheckMonth: nextCheckDate.getMonth() + 1,
      hasCleaning,
      hasFluoride,
      totalRecords: records.length,
    } as const;
  }, [records]);

  const chips: Chip[] = [];
  if (stats.concernPosition && stats.concernKind === 'lost_waiting') {
    chips.push({ label: i18nText('Dental.insight.chip.lostWaiting', { toothId: stats.concernPosition }), tone: 'warn' });
  } else if (stats.concernPosition && stats.concernKind === 'caries') {
    chips.push({ label: i18nText('Dental.insight.chip.caries', { toothId: stats.concernPosition }), tone: 'alert' });
  } else if (stats.eruptedCount > 0) {
    chips.push({ label: i18nText('Dental.insight.chip.stable'), tone: 'ok' });
  }
  chips.push({ label: i18nText('Dental.insight.chip.nextCheckMonth', { month: stats.nextCheckMonth }), tone: 'info' });
  chips.push({
    label: stats.hasCleaning
      ? i18nText('Dental.insight.chip.keepCleaningHabit')
      : stats.hasFluoride
        ? i18nText('Dental.insight.chip.keepFluorideCadence')
        : i18nText('Dental.insight.chip.buildCleaningHabit'),
    tone: 'ok',
  });

  const paragraph1 = stats.eruptedCount === 0
    ? i18nText('Dental.insight.emptyEruptionInfo')
    : i18nText('Dental.insight.eruptionSummary', {
        childName,
        ageLabel,
        eruptedCount: stats.eruptedCount,
        permanentPresent: stats.permanentPresent,
        primaryPresent: stats.primaryPresent,
      });

  const paragraph2 = stats.cariesCount > 0
    ? i18nText('Dental.insight.cariesSummary', { cariesCount: stats.cariesCount })
    : i18nText('Dental.insight.noCariesSummary');

  return (
    <Surface
      as="section"
      tone="card"
      material="glass-thick"
      elevation="raised"
      padding="lg"
      className="mb-5 relative overflow-hidden rounded-3xl"
    >
      <div className="relative mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex text-[var(--nimi-action-primary-bg)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z" />
              <path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
            </svg>
          </span>
          <span className="text-[12px] font-semibold tracking-normal text-[var(--nimi-text-primary)]">
            {i18nText('Dental.insight.aiObservation')}
          </span>
          <span className="text-[11px] text-[var(--nimi-text-muted)]">
            {i18nText('Dental.insight.recordContext', { totalRecords: stats.totalRecords, ageLabel })}
          </span>
        </div>
      </div>

      <p className="relative mb-1.5 mt-1 text-[14px] leading-7 tracking-normal text-[var(--nimi-text-primary)]">
        {paragraph1}
      </p>
      <p className="relative mb-3.5 mt-0 text-[14px] leading-7 tracking-normal text-[var(--nimi-text-primary)]">
        {paragraph2}
      </p>

      <div className="relative flex flex-wrap gap-2">
        {chips.map((c, i) => {
          const classes = CHIP_CLASSES[c.tone];
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium ${classes.chip}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${classes.dot}`} />
              {c.label}
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
