import { Button, Surface } from '@nimiplatform/kit/ui';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../app-shell/app-store.js';
import { getGrowthReports } from '../../bridge/sqlite-bridge.js';
import { GROWTH_STANDARDS } from '../../knowledge-base/index.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { i18n, i18nText } from '../../i18n/index.js';


/* ── types ────────────────────────────────────────────────── */

interface ReportRow {
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

interface OCRContent {
  imageName?: string;
  measurements: Array<{ typeId: string; value: number; measuredAt: string; notes: string | null }>;
}

/* ── helpers ──────────────────────────────────────────────── */

const TYPE_EMOJI: Record<string, string> = {
  height: '📏', weight: '⚖️', 'head-circumference': '📐', bmi: '🏃',
  'vision-left': '👁️', 'vision-right': '👁️',
  'corrected-vision-left': '👓', 'corrected-vision-right': '👓',
  'refraction-sph-left': '🔬', 'refraction-sph-right': '🔬',
  'refraction-cyl-left': '🔬', 'refraction-cyl-right': '🔬',
  'axial-length-left': '🔬', 'axial-length-right': '🔬',
  'lab-vitamin-d': '🧪', 'lab-ferritin': '🩸', 'lab-hemoglobin': '🩸',
  'lab-calcium': '🧪', 'lab-zinc': '🧪',
};

function getDisplayInfo(typeId: string) {
  const std = GROWTH_STANDARDS.find((s) => s.typeId === typeId);
  return { name: std?.displayName ?? typeId, unit: std?.unit ?? '', emoji: TYPE_EMOJI[typeId] ?? '📋' };
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

function fmtRelative(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return i18nText('Reports.history.relative.today');
  if (diff === 1) return i18nText('Reports.history.relative.yesterday');
  if (diff < 7) return i18nText('Reports.history.relative.daysAgo', { days: diff });
  if (diff < 30) return i18nText('Reports.history.relative.weeksAgo', { weeks: Math.floor(diff / 7) });
  return fmtDate(dateStr);
}

function parseContent(content: string): OCRContent | null {
  try { return JSON.parse(content) as OCRContent; } catch { return null; }
}

/* ── Group reports by month ──────────────────────────────── */

function groupByMonth(reports: ReportRow[]): Array<{ monthLabel: string; items: ReportRow[] }> {
  const map = new Map<string, ReportRow[]>();
  for (const r of reports) {
    const d = new Date(r.generatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const arr = map.get(key);
    if (arr) arr.push(r); else map.set(key, [r]);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const [y, m] = key.split('-');
      return { monthLabel: i18nText('Reports.history.monthLabel', { year: y, month: parseInt(m!) }), items };
    });
}

/* ================================================================
   PAGE
   ================================================================ */

export default function ReportHistoryPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeChildId) {
      getGrowthReports(activeChildId, 'ocr-upload').then(setReports).catch(catchLog('report-history', 'action:load-growth-reports-failed'));
    }
  }, [activeChildId]);

  const grouped = useMemo(() => groupByMonth(reports), [reports]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Reports.history.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  return (
    <ProfileDetailShell
      title={
        <span className="flex flex-col">
          <span>{i18nText('Reports.history.title')}</span>
          <span className="text-[14px] font-normal mt-0.5 text-[var(--nimi-text-muted)]">
            {i18nText('Reports.history.summary', { count: reports.length })}
          </span>
        </span>
      }
      actions={
        <Button asChild tone="primary" size="md">
          <Link to="/profile">{i18nText('Reports.history.uploadNew')}</Link>
        </Button>
      }
    >
      {reports.length === 0 ? (
        /* Empty state */
        <Surface tone="card" material="solid" elevation="raised" padding="none" className="p-10 flex flex-col items-center">
          <span className="text-[48px] mb-3">📄</span>
          <p className="text-[16px] font-medium text-[var(--nimi-text-primary)]">{i18nText('Reports.history.emptyTitle')}</p>
          <p className="text-[14px] mt-1 mb-4 text-[var(--nimi-text-muted)]">{i18nText('Reports.history.emptyBody')}</p>
          <Button asChild tone="primary" size="md">
            <Link to="/profile">{i18nText('Reports.history.uploadFirst')}</Link>
          </Button>
        </Surface>
      ) : (
        /* Timeline grouped by month */
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />

          {grouped.map((group) => (
            <div key={group.monthLabel} className="relative pl-10 pb-6">
              {/* Month dot */}
              <div className="absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center bg-[var(--nimi-action-primary-bg)] border-[var(--nimi-action-primary-bg)]">
                <div className="w-[6px] h-[6px] rounded-full bg-[var(--nimi-action-primary-text)]" />
              </div>

              {/* Month label */}
              <p className="text-[14px] font-bold mb-3 text-[var(--nimi-text-primary)]">{group.monthLabel}</p>

              {/* Report cards */}
              <div className="space-y-3">
                {group.items.map((report) => {
                  const data = parseContent(report.content);
                  const isExpanded = expandedId === report.reportId;

                  return (
                    <Surface key={report.reportId} tone="card" material="solid" elevation="raised" padding="none" className="overflow-hidden transition-all">
                      {/* Header — clickable to expand */}
                      <button onClick={() => setExpandedId(isExpanded ? null : report.reportId)}
                        className="w-full flex items-center gap-3 p-4 text-left">
                        <div className="w-[36px] h-[36px] rounded-xl flex items-center justify-center text-[18px] shrink-0 bg-[var(--nimi-surface-active)]">🔍</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">
                            {data?.imageName ?? i18nText('Reports.history.defaultReportName')}
                          </p>
                          <p className="text-[12px] text-[var(--nimi-text-muted)]">
                            {i18nText('Reports.history.recognizedLine', {
                              relative: fmtRelative(report.generatedAt),
                              count: data?.measurements.length ?? 0,
                            })}
                          </p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={'var(--nimi-text-muted)'} strokeWidth="2" strokeLinecap="round"
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && data && (
                        <div className="px-4 pb-4 border-t border-[var(--nimi-border-subtle)]">
                          <p className="text-[12px] py-2 text-[var(--nimi-text-muted)]">
                            {i18nText('Reports.history.detailLine', {
                              start: report.periodStart,
                              end: report.periodEnd,
                              uploadedAt: fmtDate(report.generatedAt),
                            })}
                          </p>
                          <div className="space-y-1.5">
                            {data.measurements.map((m, i) => {
                              const info = getDisplayInfo(m.typeId);
                              return (
                                <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-[var(--nimi-surface-panel)]">
                                  <span className="text-[16px]">{info.emoji}</span>
                                  <span className="text-[14px] flex-1 text-[var(--nimi-text-primary)]">{info.name}</span>
                                  <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{m.value}</span>
                                  <span className="text-[12px] w-12 text-[var(--nimi-text-muted)]">{info.unit}</span>
                                  <span className="text-[12px] text-[var(--nimi-text-muted)]">{m.measuredAt}</span>
                                </div>
                              );
                            })}
                          </div>
                          {data.measurements.some((m) => m.notes) && (
                            <div className="mt-2">
                              {data.measurements.filter((m) => m.notes).map((m, i) => (
                                <p key={i} className="text-[12px] text-[var(--nimi-text-muted)]">📝 {m.notes}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Surface>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ProfileDetailShell>
  );
}
