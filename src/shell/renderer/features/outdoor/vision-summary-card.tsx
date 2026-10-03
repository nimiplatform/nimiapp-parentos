import { Surface } from '@nimiplatform/kit/ui';
import { ChevronRight, Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMeasurements, type MeasurementRow } from '../../bridge/sqlite-bridge.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { EYE_SET, groupByDate } from '../profile/vision-data.js';
import { i18nText } from '../../i18n/index.js';
import { parseDate } from './outdoor-helpers.js';


const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO);
  const b = new Date(toISO);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatElapsed(days: number): string {
  if (days <= 1) return i18nText('Common.relative.today');
  if (days < 30) return i18nText('Common.relative.daysAgo', { days });
  if (days < 365) return i18nText('Common.relative.monthsAgo', { months: Math.round(days / 30) });
  return i18nText('Common.relative.yearsAgo', { years: Math.round(days / 365) });
}

/** "8月15日" this year, the full ISO date for older exams. */
function formatExamDate(isoDate: string, todayISO: string): string {
  if (isoDate.slice(0, 4) !== todayISO.slice(0, 4)) return isoDate;
  const d = parseDate(isoDate);
  return i18nText('Outdoor.date.shortMonthDay', { month: d.getMonth() + 1, day: d.getDate() });
}

/** Acuity reads as "1.0", not "1"; other values keep their recorded precision. */
function formatAcuity(value: number | undefined): string {
  if (value == null) return '–';
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/**
 * Closes the myopia-prevention loop on the outdoor page: why outdoor time
 * matters, then the latest vision exam as a link into the vision archive.
 */
export function VisionSummaryCard({ childId, className = '' }: { childId: string; className?: string }) {
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);

  useEffect(() => {
    getMeasurements(childId)
      .then(setMeasurements)
      .catch(catchLog('outdoor', 'action:load-vision-measurements-failed'));
  }, [childId]);

  const latestRecord = useMemo(() => {
    const records = groupByDate(measurements.filter((m) => EYE_SET.has(m.typeId)));
    return records[0] ?? null;
  }, [measurements]);

  const todayISO = new Date().toISOString().slice(0, 10);

  const vr = latestRecord?.data.get('vision-right');
  const vl = latestRecord?.data.get('vision-left');
  const ar = latestRecord?.data.get('axial-length-right');
  const al = latestRecord?.data.get('axial-length-left');
  const hasVision = vr != null || vl != null;
  const hasAxial = ar != null || al != null;

  return (
    <Surface
      as="section"
      aria-labelledby="outdoor-vision-title"
      tone="card"
      material="glass-thick"
      elevation="base"
      padding="none"
      className={`min-w-0 rounded-[20px] px-6 pb-6 pt-5 ${className}`}
    >
      <h3 id="outdoor-vision-title" className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">
        {i18nText('Outdoor.visionSummary.profileTitle')}
      </h3>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
        {i18nText('Outdoor.visionSummary.why')}
      </p>

      <Link
        to="/profile/vision"
        data-testid="outdoor-vision-summary"
        className={`group mt-4 flex items-center gap-4 rounded-2xl bg-white/85 px-5 py-4 no-underline shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_6%,transparent)] transition-colors hover:bg-white ${FOCUS_RING}`}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_13%,transparent)] text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))]">
          <Eye size={21} strokeWidth={1.8} aria-hidden="true" />
        </span>
        {latestRecord ? (
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Outdoor.visionSummary.latestExam')}</span>
              <span className="text-[12.5px] text-[var(--nimi-text-muted)]">
                {formatExamDate(latestRecord.date, todayISO)} · {formatElapsed(daysBetween(latestRecord.date, todayISO))}
              </span>
            </span>
            {hasVision || hasAxial ? (
              <span className="mt-1.5 flex flex-col gap-0.5 text-[13.5px] leading-[1.6] tabular-nums text-[var(--nimi-text-secondary)]">
                {hasVision ? (
                  <span>
                    <span className="text-[var(--nimi-text-muted)]">{i18nText('Outdoor.visionSummary.uncorrectedVision')}</span>
                    {' '}R {formatAcuity(vr)} {i18nText('Outdoor.visionSummary.leftEyeSeparator')} {formatAcuity(vl)}
                  </span>
                ) : null}
                {hasAxial ? (
                  <span>
                    <span className="text-[var(--nimi-text-muted)]">{i18nText('Outdoor.visionSummary.axialLength')}</span>
                    {' '}R {ar ?? '–'} {i18nText('Outdoor.visionSummary.leftEyeSeparator')} {al ?? '–'} mm
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Outdoor.visionSummary.noExamRecords')}</span>
            <span className="mt-0.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Outdoor.visionSummary.addRecord')}</span>
          </span>
        )}
        <ChevronRight
          size={17}
          strokeWidth={1.8}
          aria-hidden="true"
          className="shrink-0 text-[var(--nimi-text-muted)] transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </Surface>
  );
}
