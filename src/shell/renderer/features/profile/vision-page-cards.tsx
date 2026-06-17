/**
 * Vision archive timeline UI atoms.
 *
 * The redesigned vision archive renders a top-to-bottom story:
 *   header → AI summary → 3 glance chips → trend chart → exam timeline → next steps.
 * The atoms here are scoped to the vision page; nothing else in ParentOS should
 * import them directly.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  EXAM_METRIC_GROUPS,
  fmtAge,
  getAxialRef,
  readMetric,
  type ExamView,
  type GlanceMetric,
  type VisionRecord,
} from './vision-data.js';
import { i18nText } from '../../i18n/index.js';


const MONO = "var(--nimi-font-mono, 'JetBrains Mono', 'SF Mono', ui-monospace, monospace)";

/* ── Status pill — tinted background with leading dot ────────────── */

export type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function StatusPill({ tone = 'ok', children }: { tone?: PillTone; children: ReactNode }) {
  const t = pillToneClasses(tone);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap ${t.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

/* ── At-a-glance chip — paired OD/OS values + status tag ─────────── */

export function GlanceChip({ metric }: { metric: GlanceMetric }) {
  const t = pillToneClasses(metric.status);
  const renderEye = (value: number | null, label: string) => (
    <div>
      <span className="text-[9px] tracking-[0.08em]" style={{ color: 'var(--nimi-fg-4)' }}>{label} </span>
      <span
        className="text-[18px] font-semibold tracking-[-0.02em]"
        style={{ color: value == null ? 'var(--nimi-fg-4)' : 'var(--nimi-fg-1)', fontFamily: MONO }}
      >
        {value == null ? '—' : metric.format(value)}
      </span>
    </div>
  );
  return (
    <div
      className="relative overflow-hidden rounded-[18px] p-[14px] nimi-material-glass-regular bg-[var(--nimi-material-glass-regular-bg)] border border-[var(--nimi-material-glass-regular-border)]"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 4px 14px rgba(15,23,42,0.04)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium" style={{ color: 'var(--nimi-fg-3)' }}>{metric.label}</span>
        <span
          className={`rounded-full px-[7px] py-0.5 text-[10px] font-semibold ${t.pill}`}
        >
          {metric.tag}
        </span>
      </div>
      <div className="flex items-baseline gap-2.5" style={{ fontFamily: MONO }}>
        {renderEye(metric.od, 'OD')}
        {renderEye(metric.os, 'OS')}
        {metric.unit && (
          <span className="text-[10px] -ml-1" style={{ color: 'var(--nimi-fg-3)' }}>{metric.unit}</span>
        )}
      </div>
    </div>
  );
}

function pillToneClasses(tone: PillTone): { pill: string; dot: string } {
  if (tone === 'ok') {
    return {
      pill: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_10%,transparent)] text-[var(--nimi-status-success)]',
      dot: 'bg-[var(--nimi-status-success)]',
    };
  }
  if (tone === 'warn') {
    return {
      pill: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_12%,transparent)] text-[var(--nimi-status-warning)]',
      dot: 'bg-[var(--nimi-status-warning)]',
    };
  }
  if (tone === 'danger') {
    return {
      pill: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_10%,transparent)] text-[var(--nimi-status-danger)]',
      dot: 'bg-[var(--nimi-status-danger)]',
    };
  }
  if (tone === 'info') {
    return {
      pill: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,transparent)] text-[var(--nimi-status-info)]',
      dot: 'bg-[var(--nimi-status-info)]',
    };
  }
  return {
    pill: 'bg-[color-mix(in_srgb,var(--nimi-text-muted)_10%,transparent)] text-[var(--nimi-text-secondary)]',
    dot: 'bg-[var(--nimi-text-muted)]',
  };
}

/* ── Chevron icon ────────────────────────────────────────────────── */

function ChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ── AgeFilter — horizontal age timeline picker ──────────────────── */

const examTypeStroke = (kind: ExamView['kind']) =>
  kind === 'full' ? 'var(--nimi-accent)' : kind === 'biometric' ? 'var(--nimi-status-info)' : 'var(--nimi-text-muted)';

function examTypeLabel(kind: ExamView['kind']): string {
  if (kind === 'full') return i18nText('Vision.examType.full');
  if (kind === 'biometric') return i18nText('Vision.examType.biometric');
  return i18nText('Vision.examType.screen');
}

export function AgeFilter({
  exams,
  birthDate,
  selectedAge,
  onPick,
  activeExamId,
  onExamClick,
}: {
  exams: ExamView[];
  birthDate: string;
  selectedAge: number | null;
  onPick: (age: number | null) => void;
  activeExamId: string | null;
  onExamClick?: (id: string) => void;
}) {
  const bday = useMemo(() => new Date(birthDate), [birthDate]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const ageOf = (date: string) => (new Date(date).getTime() - bday.getTime()) / (365.25 * 24 * 3600 * 1000);

  if (exams.length === 0) return null;

  const ages = exams.map((e) => ageOf(e.date));
  const minYear = Math.floor(Math.min(...ages));
  const maxYearRaw = Math.ceil(Math.max(...ages));
  const maxYear = Math.max(maxYearRaw, minYear + 1);
  const span = Math.max(1, maxYear - minYear);
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  return (
    <div
      className="rounded-[18px] mb-3 nimi-material-glass-regular bg-[var(--nimi-material-glass-regular-bg)] border border-[var(--nimi-material-glass-regular-border)]"
      style={{ padding: '20px 18px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 6px 18px rgba(15,23,42,0.04)' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-3.5" style={{ color: 'var(--nimi-fg-4)' }}>
        {i18nText('Vision.timeline.ageFilterTitle')}
      </div>

      <div className="relative h-16 px-1">
        <div
          className="absolute left-0 right-0 top-[30px] h-0.5 rounded"
          style={{ background: 'linear-gradient(to right, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.06) 100%)' }}
        />

        {years.map((y) => {
          const t = (y - minYear) / span;
          const isSelected = selectedAge === y;
          const isPickable = y < maxYear;
          return (
            <button
              key={y}
              onClick={() => isPickable && onPick(isSelected ? null : y)}
              disabled={!isPickable}
              className="absolute top-0 flex flex-col items-center gap-1 border-0 bg-transparent p-0"
              style={{
                left: `${t * 100}%`,
                transform: 'translateX(-50%)',
                cursor: isPickable ? 'pointer' : 'default',
              }}
            >
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-bold transition-all duration-150"
                style={{
                  color: isSelected ? 'var(--nimi-accent)' : 'var(--nimi-fg-2)',
                  background: isSelected ? 'var(--nimi-accent-soft)' : 'transparent',
                }}
              >
                {i18nText('Vision.age.yearsShort', { years: y })}
              </span>
              <span
                className="w-0.5 h-3 transition-all duration-150"
                style={{ background: isSelected ? 'var(--nimi-accent)' : 'rgba(15,23,42,0.15)' }}
              />
            </button>
          );
        })}

        {exams.map((e, i) => {
          const a = ageOf(e.date);
          const t = (a - minYear) / span;
          const isInSelected = selectedAge != null && Math.floor(a) === selectedAge;
          const isActive = e.id === activeExamId;
          const isHover = e.id === hoverId;
          const dimmed = selectedAge != null && !isInSelected;
          const tooltipColor = examTypeStroke(e.kind);
          return (
            <div
              key={e.id}
              className="absolute flex flex-col items-center transition-opacity duration-150"
              style={{
                left: `${t * 100}%`,
                top: 22,
                transform: 'translate(-50%, 0)',
                opacity: dimmed ? 0.3 : 1,
                zIndex: isHover || isActive ? 5 : 1,
              }}
            >
              {isHover && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-[10px] flex flex-col items-center gap-0.5 whitespace-nowrap pointer-events-none nimi-material-glass-thick bg-[var(--nimi-material-glass-thick-bg)] border border-[var(--nimi-material-glass-thick-border)]"
                  style={{ bottom: 'calc(100% + 6px)', boxShadow: '0 6px 16px rgba(15,23,42,0.12)' }}
                >
                  <span className="text-[11px] font-semibold" style={{ fontFamily: MONO, color: 'var(--nimi-fg-1)' }}>
                    {e.date}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--nimi-fg-3)' }}>
                    {i18nText('Vision.timeline.examTooltipAgeKind', { age: a.toFixed(1), kind: examTypeLabel(e.kind) })}
                  </span>
                </div>
              )}
              <button
                onMouseEnter={() => setHoverId(e.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => onExamClick?.(e.id)}
                title={i18nText('Vision.timeline.examTitle', { date: e.date, kind: examTypeLabel(e.kind) })}
                className="grid place-items-center border-0 bg-transparent p-1 cursor-pointer"
              >
                <span
                  className="rounded-full transition-all duration-150 border-[1.5px] border-white"
                  style={{
                    width: isActive ? 12 : isHover ? 11 : 8,
                    height: isActive ? 12 : isHover ? 11 : 8,
                    background: tooltipColor,
                    boxShadow: isActive
                      ? `0 0 0 3px ${tooltipColor}33`
                      : `0 0 0 1px ${tooltipColor}`,
                  }}
                />
              </button>
              {(i === 0 || (selectedAge != null && isInSelected)) && !isHover && (
                <span
                  className="text-[9px] mt-0.5 whitespace-nowrap"
                  style={{ color: 'var(--nimi-fg-3)', fontFamily: MONO }}
                >
                  {e.date.slice(5)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="mt-2.5 pt-2.5 flex items-center justify-between text-[10px]"
        style={{ borderTop: '1px solid rgba(15,23,42,0.05)', color: 'var(--nimi-fg-3)' }}
      >
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--nimi-accent)' }} />{i18nText('Vision.examType.full')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#0ea5e9' }} />{i18nText('Vision.examType.biometric')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#94a3b8' }} />{i18nText('Vision.examType.screen')}
          </span>
        </div>
        {selectedAge != null && (
          <button
            onClick={() => onPick(null)}
            className="border-0 bg-transparent text-[11px] cursor-pointer"
            style={{ color: 'var(--nimi-accent)' }}
          >
            {i18nText('Vision.timeline.clearAgeFilter')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── ExamTimelineCard — vertical-rail dot + expandable details ───── */

const SCREENING_LABEL_KEYS: Record<string, string> = {
  'red-reflex': 'Vision.screening.label.redReflex',
  'fixation-tracking': 'Vision.screening.label.fixationTracking',
  'cover-test': 'Vision.screening.label.coverTest',
  photoscreener: 'Vision.screening.label.photoscreener',
  'tear-duct': 'Vision.screening.label.tearDuct',
  'eye-checkup': 'Vision.screening.label.eyeCheckup',
};

const SCREENING_RESULT: Record<string, { label: string; tone: PillTone }> = {
  pass: { label: i18nText('Vision.screening.result.pass'), tone: 'ok' },
  refer: { label: i18nText('Vision.screening.result.refer'), tone: 'danger' },
  inconclusive: { label: i18nText('Vision.screening.result.inconclusive'), tone: 'warn' },
};

function screeningLabel(key: string | null | undefined): string {
  if (!key) return i18nText('Vision.screening.label.eyeCheckup');
  const labelKey = SCREENING_LABEL_KEYS[key];
  return labelKey ? i18nText(labelKey) : key;
}

/* ── Collapsed-card metric panel — OD/OS tabular preview ───────────── */

function computeSE(record: VisionRecord, eye: 'OD' | 'OS'): number | null {
  const sphKey = eye === 'OD' ? 'refraction-sph-right' : 'refraction-sph-left';
  const cylKey = eye === 'OD' ? 'refraction-cyl-right' : 'refraction-cyl-left';
  const sph = record.data.get(sphKey);
  if (sph == null) return null;
  const cyl = record.data.get(cylKey) ?? 0;
  return +(sph + cyl / 2).toFixed(2);
}

const fmtSigned = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);

function surplusColorTone(v: number): string {
  if (v >= 0.5) return '#047857';
  if (v >= 0) return '#b45309';
  return '#b91c1c';
}

interface MetricRow {
  key?: string;
  label: string;
  od: number | null;
  os: number | null;
  format: (v: number) => string;
  /** Per-row unit shown inline after the value when the section header
   *  cannot carry a single unit, such as mixed-unit refraction groups. */
  unit?: string;
  odColor?: string;
  osColor?: string;
  /** Render value text with reduced visual weight — for derived/peer rows. */
  muted?: boolean;
  /** Bump up font weight, used on the hero row of each section. */
  emphasis?: boolean;
}

function MetricSection({
  title,
  unit,
  rows,
}: {
  title: string;
  unit?: string;
  rows: MetricRow[];
}) {
  return (
    <div className="px-3.5 py-3">
      <div
        className="grid items-baseline pb-1.5 mb-1.5"
        style={{
          gridTemplateColumns: 'minmax(0, 1.1fr) repeat(2, minmax(0, 1fr))',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <span className="text-[11px] font-semibold" style={{ color: 'var(--nimi-fg-2)' }}>
          {title}
          {unit && <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--nimi-fg-4)' }}>({unit})</span>}
        </span>
        <span className="text-[10px] text-right pr-3" style={{ color: 'var(--nimi-fg-4)' }}>{i18nText('Vision.eye.od')}</span>
        <span className="text-[10px] text-right pr-3" style={{ color: 'var(--nimi-fg-4)' }}>{i18nText('Vision.eye.os')}</span>
      </div>
      {rows.map((r) => {
        const valueWeight = r.emphasis ? 600 : 500;
        const fontSize = r.emphasis ? 14 : 13;
        const baseColor = r.muted ? 'var(--nimi-fg-3)' : 'var(--nimi-fg-1)';
        const renderValue = (value: number | null, color: string | undefined) => {
          if (value == null) return <span style={{ color: baseColor, fontFamily: MONO }}>—</span>;
          return (
            <>
              <span style={{ color: color ?? baseColor, fontFamily: MONO }}>{r.format(value)}</span>
              {r.unit && (
                <span className="ml-0.5 text-[9px]" style={{ color: 'var(--nimi-fg-4)', fontFamily: MONO }}>
                  {r.unit}
                </span>
              )}
            </>
          );
        };
        return (
          <div
            key={r.key ?? r.label}
            className="grid items-baseline py-1"
            style={{ gridTemplateColumns: 'minmax(0, 1.1fr) repeat(2, minmax(0, 1fr))' }}
          >
            <span className="text-[11px]" style={{ color: r.muted ? 'var(--nimi-fg-4)' : 'var(--nimi-fg-3)' }}>
              {r.label}
            </span>
            <span
              className="text-right pr-3 tabular-nums tracking-[-0.01em]"
              style={{ fontSize, fontWeight: valueWeight }}
            >
              {renderValue(r.od, r.odColor)}
            </span>
            <span
              className="text-right pr-3 tabular-nums tracking-[-0.01em]"
              style={{ fontSize, fontWeight: valueWeight }}
            >
              {renderValue(r.os, r.osColor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CollapsedMetricStrip({
  exam,
  gender,
}: {
  exam: ExamView;
  gender: string;
}) {
  if (exam.source !== 'measurement' || !exam.record) return null;
  const record = exam.record;

  const seOD = computeSE(record, 'OD');
  const seOS = computeSE(record, 'OS');
  const cylOD = record.data.get('refraction-cyl-right') ?? null;
  const cylOS = record.data.get('refraction-cyl-left') ?? null;
  const hasRefraction = seOD != null || seOS != null || cylOD != null || cylOS != null;

  const alOD = record.data.get('axial-length-right') ?? null;
  const alOS = record.data.get('axial-length-left') ?? null;
  const hasAL = alOD != null || alOS != null;

  const ref = getAxialRef(exam.ageMonths, gender);
  const surplusOD = ref && alOD != null ? +(ref.critical - alOD).toFixed(2) : null;
  const surplusOS = ref && alOS != null ? +(ref.critical - alOS).toFixed(2) : null;

  if (!hasRefraction && !hasAL) return null;

  const refractionRows: MetricRow[] = ([
    { label: 'SE', od: seOD, os: seOS, format: fmtSigned, emphasis: true },
    { label: 'CYL', od: cylOD, os: cylOS, format: (v: number) => v.toFixed(2) },
  ] satisfies MetricRow[]).filter((r) => r.od != null || r.os != null);

  const axialRows: MetricRow[] = [
    { label: 'AL', od: alOD, os: alOS, format: (v: number) => v.toFixed(2), emphasis: true },
    ...(ref
      ? ([
          { key: 'same-age-mean', label: i18nText('Vision.reference.sameAgeMean'), od: ref.mean, os: ref.mean, format: (v: number) => v.toFixed(2), muted: true },
          { key: 'same-age-critical', label: i18nText('Vision.reference.sameAgeCritical'), od: ref.critical, os: ref.critical, format: (v: number) => v.toFixed(2), muted: true },
          {
            key: 'surplus',
            label: i18nText('Vision.reference.surplus'),
            od: surplusOD,
            os: surplusOS,
            format: (v: number) => v.toFixed(2),
            odColor: surplusOD != null ? surplusColorTone(surplusOD) : undefined,
            osColor: surplusOS != null ? surplusColorTone(surplusOS) : undefined,
            emphasis: true,
          },
        ] satisfies MetricRow[])
      : []),
  ];

  const showSplit = hasRefraction && hasAL;

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: showSplit ? '1fr 1px 1.25fr' : '1fr' }}
    >
      {hasRefraction && <MetricSection title={i18nText('Vision.group.refractionSheet')} unit="D" rows={refractionRows} />}
      {showSplit && <div style={{ background: 'rgba(15,23,42,0.08)' }} />}
      {hasAL && <MetricSection title={i18nText('Vision.group.biometrySheet')} unit="mm" rows={axialRows} />}
    </div>
  );
}

export function ExamTimelineCard({
  exam,
  gender,
  isLatest,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
}: {
  exam: ExamView;
  gender: string;
  isLatest: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div data-exam-id={exam.id}>
      <article
        className="overflow-hidden nimi-material-glass-regular bg-[var(--nimi-material-glass-regular-bg)] border border-[var(--nimi-material-glass-regular-border)] backdrop-blur-[var(--nimi-backdrop-blur-regular)] rounded-[var(--nimi-radius-xl)] shadow-[0_8px_32px_rgba(31,38,135,0.04)]"
      >
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3.5 border-0 bg-transparent text-left cursor-pointer"
          style={{ padding: '16px 18px' }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold tracking-[-0.01em]" style={{ color: 'var(--nimi-fg-1)' }}>
                {examTypeLabel(exam.kind)}
              </span>
              {isLatest && <StatusPill tone="ok">{i18nText('Vision.timeline.latest')}</StatusPill>}
              <span className="text-[11px]" style={{ color: 'var(--nimi-fg-4)' }}>· {i18nText('Vision.timeline.daysAgo', { days: exam.daysAgo })}</span>
            </div>
            <div className="mt-1 text-[12px] flex items-center gap-2 flex-wrap" style={{ color: 'var(--nimi-fg-3)' }}>
              <span>{fmtAge(exam.ageMonths)}</span>
              {exam.hospital && (
                <>
                  <span style={{ color: 'var(--nimi-fg-4)' }}>·</span>
                  <span>{exam.hospital}</span>
                </>
              )}
              {exam.doctor && (
                <>
                  <span style={{ color: 'var(--nimi-fg-4)' }}>·</span>
                  <span>{exam.doctor}</span>
                </>
              )}
            </div>
          </div>
          <span
            className="transition-transform duration-200"
            style={{
              color: 'var(--nimi-fg-3)',
              transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          >
            <ChevronDown size={16} />
          </span>
        </button>

        <div style={{ padding: '0 18px 18px' }}>
          {exam.source === 'screening' ? (
            <ScreeningDetail exam={exam} />
          ) : isOpen ? (
            <MeasurementDetail exam={exam} gender={gender} />
          ) : (
            <CollapsedMetricStrip exam={exam} gender={gender} />
          )}

          {isOpen && exam.source === 'measurement' && (onEdit || onDelete) && (
            <div className="flex justify-end gap-2 mt-4">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="text-[12px] px-3 py-1.5 rounded-full border-0 cursor-pointer"
                  style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--nimi-fg-2)' }}
                >
                  {i18nText('Vision.timeline.edit')}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  aria-label={`delete-vision-record-${exam.date}`}
                  className="text-[12px] px-3 py-1.5 rounded-full border-0 cursor-pointer"
                  style={{ background: 'rgba(239,68,68,0.10)', color: '#b91c1c' }}
                >
                  {i18nText('Vision.timeline.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function ScreeningDetail({ exam }: { exam: ExamView }) {
  const currentScreeningLabel = screeningLabel(exam.screeningKey);
  const result = exam.result ? SCREENING_RESULT[exam.result] : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium" style={{ color: 'var(--nimi-fg-1)' }}>{currentScreeningLabel}</span>
        {result && <StatusPill tone={result.tone}>{result.label}</StatusPill>}
      </div>
      {exam.notes && (
        <div
          className="rounded-[10px] text-[12px]"
          style={{
            padding: '10px 12px',
            background: 'rgba(245,158,11,0.06)',
            borderLeft: '3px solid #f59e0b',
            color: 'var(--nimi-fg-2)',
          }}
        >
          {exam.notes}
        </div>
      )}
    </div>
  );
}


function MeasurementDetail({
  exam,
  gender,
}: {
  exam: ExamView;
  gender: string;
}) {
  const record = exam.record!;
  const fmt2 = (v: number) => v.toFixed(2);

  // Reference data for the biometric section. Surplus = P75 − current AL.
  const ref = getAxialRef(exam.ageMonths, gender);
  const alOD = record.data.get('axial-length-right') ?? null;
  const alOS = record.data.get('axial-length-left') ?? null;
  const surplusOD = ref && alOD != null ? +(ref.critical - alOD).toFixed(2) : null;
  const surplusOS = ref && alOS != null ? +(ref.critical - alOS).toFixed(2) : null;
  const ageY = Math.round(exam.ageMonths / 12);

  // Build per-section rows. AL → reference rows → AD/K1/K2 in one biometric block.
  const filledGroups = EXAM_METRIC_GROUPS.map((g) => {
    const rows: MetricRow[] = g.metrics
      .filter((m) => readMetric(record, m, 'OD') != null || readMetric(record, m, 'OS') != null)
      .map((m) => ({
        key: m.key,
        label: m.label,
        od: readMetric(record, m, 'OD'),
        os: readMetric(record, m, 'OS'),
        format: m.format ?? fmt2,
        unit: m.unit || undefined,
        emphasis: m.important,
        muted: m.muted,
      }));

    if (g.key === 'biometric' && ref && (alOD != null || alOS != null)) {
      const alIdx = rows.findIndex((r) => r.key === 'al');
      const insertAfter = alIdx >= 0 ? alIdx + 1 : 0;
      const refRows: MetricRow[] = [
        { key: 'same-age-mean', label: i18nText('Vision.reference.sameAgeMean'), od: ref.mean, os: ref.mean, format: fmt2, unit: 'mm', muted: true },
        { key: 'same-age-critical', label: i18nText('Vision.reference.sameAgeCriticalWithAge', { age: ageY }), od: ref.critical, os: ref.critical, format: fmt2, unit: 'mm', muted: true },
        {
          key: 'surplus',
          label: i18nText('Vision.reference.surplus'),
          od: surplusOD,
          os: surplusOS,
          format: fmt2,
          unit: 'mm',
          odColor: surplusOD != null ? surplusColorTone(surplusOD) : undefined,
          osColor: surplusOS != null ? surplusColorTone(surplusOS) : undefined,
          emphasis: true,
        },
      ];
      rows.splice(insertAfter, 0, ...refRows);
    }

    return { ...g, rows };
  }).filter((g) => g.rows.length > 0);

  return (
    <>
      {exam.notes && (
        <div
          className="rounded-[10px] text-[12px] mb-3"
          style={{
            padding: '10px 12px',
            background: 'rgba(245,158,11,0.06)',
            borderLeft: '3px solid #f59e0b',
            color: 'var(--nimi-fg-2)',
          }}
        >
          <span className="font-semibold mr-1" style={{ color: '#92400e' }}>{i18nText('Vision.timeline.notesPrefix')}</span>
          {exam.notes}
        </div>
      )}
      <div className="flex flex-col">
        {filledGroups.map((g, gi) => (
          <div
            key={g.key}
            style={gi > 0 ? { borderTop: '1px solid rgba(15,23,42,0.06)', marginTop: 8, paddingTop: 8 } : undefined}
          >
            <MetricSection title={g.label} rows={g.rows} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Empty state ─────────────────────────────────────────────────── */

export function EmptyTimelineCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-[20px] p-6 text-center nimi-material-glass-regular bg-[var(--nimi-material-glass-regular-bg)] border border-[var(--nimi-material-glass-regular-border)]"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 6px 18px rgba(15,23,42,0.04)' }}
    >
      <span className="text-[13px]" style={{ color: 'var(--nimi-fg-3)' }}>{message}</span>
    </div>
  );
}

/** Re-export the helper so vision-page does not need to know about VisionRecord. */
export type { VisionRecord };
