import { Button, DatePicker, Surface, TextareaField } from '@nimiplatform/kit/ui';
import {
  HealthRecordModalShell,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { useState, useEffect, useMemo } from 'react';
import { useAppStore, computeAgeMonths, formatAge } from '../../app-shell/app-store.js';
import { MILESTONE_CATALOG } from '../../knowledge-base/index.js';
import type { MilestoneDomain } from '../../knowledge-base/gen/milestone-catalog.gen.js';
import { getMilestoneRecords, upsertMilestoneRecord } from '../../bridge/sqlite-bridge.js';
import type { MilestoneRecordRow } from '../../bridge/sqlite-bridge.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { AISummaryCard } from './ai-summary-card.js';
import { readImageFileAsDataUrl } from './checkup-ocr.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { i18nText } from '../../i18n/index.js';


/* ── domain config ───────────────────────────────────────── */

const DOMAINS: Array<{ key: MilestoneDomain; label: string; emoji: string; toneClass: string }> = [
  { key: 'gross-motor', label: i18nText('Milestone.domain.grossMotor'), emoji: '🏃', toneClass: 'bg-[var(--nimi-surface-active)]' },
  { key: 'fine-motor', label: i18nText('Milestone.domain.fineMotor'), emoji: '✋', toneClass: 'bg-[var(--nimi-surface-muted)]' },
  { key: 'language', label: i18nText('Milestone.domain.language'), emoji: '💬', toneClass: 'bg-[var(--nimi-surface-active)]' },
  { key: 'cognitive', label: i18nText('Milestone.domain.cognitive'), emoji: '🧠', toneClass: 'bg-[var(--nimi-surface-muted)]' },
  { key: 'social-emotional', label: i18nText('Milestone.domain.socialEmotional'), emoji: '🤝', toneClass: 'bg-[var(--nimi-surface-muted)]' },
  { key: 'self-care', label: i18nText('Milestone.domain.selfCare'), emoji: '🪥', toneClass: 'bg-[var(--nimi-surface-active)]' },
];
const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.key, d]));

type AgeBucket = {
  startMonth: number;
  endMonth: number;
  label: string;
  milestones: typeof MILESTONE_CATALOG;
};

function formatAchievedDate(achievedAt: string | null | undefined) {
  return achievedAt?.split('T')[0] ?? i18nText('Milestone.record.recordedFallback');
}

/* ================================================================
   RADAR CHART (pure SVG)
   ================================================================ */

function RadarChart({ data }: { data: Array<{ label: string; pct: number }> }) {
  const n = data.length;
  const cx = 100, cy = 100, r = 70;
  const angleStep = (2 * Math.PI) / n;

  const pointAt = (i: number, radius: number) => {
    const a = -Math.PI / 2 + i * angleStep;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1];
  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => pointAt(i, r));
  // Data polygon
  const dataPts = data.map((d, i) => pointAt(i, r * Math.min(1, d.pct / 100)));

  return (
    <svg width="200" height="200" viewBox="0 0 200 200" className="mx-auto">
      {/* Grid rings */}
      {rings.map((s) => (
        <polygon key={s} points={Array.from({ length: n }, (_, i) => pointAt(i, r * s).join(',')).join(' ')}
          fill="none" stroke="var(--nimi-border-subtle)" strokeWidth="0.5" />
      ))}
      {/* Axes */}
      {axes.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--nimi-border-subtle)" strokeWidth="0.5" />
      ))}
      {/* Data polygon */}
      <polygon points={dataPts.map((p) => p.join(',')).join(' ')}
        fill={'var(--nimi-action-primary-bg)'} fillOpacity="0.15" stroke={'var(--nimi-action-primary-bg)'} strokeWidth="1.5" />
      {/* Data dots */}
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={'var(--nimi-action-primary-bg)'} />
      ))}
      {/* Labels */}
      {data.map((d, i) => {
        const [x, y] = pointAt(i, r + 18);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fontWeight="600" fill={'var(--nimi-text-primary)'}>{d.label}</text>
        );
      })}
    </svg>
  );
}

/* ================================================================
   RECORD DETAIL MODAL
   ================================================================ */

function RecordModal({ milestone, record, childId, ageMonths, onSave, onClose }: {
  milestone: typeof MILESTONE_CATALOG[number];
  record: MilestoneRecordRow | undefined;
  childId: string; ageMonths: number;
  onSave: () => void; onClose: () => void;
}) {
  const [date, setDate] = useState(record?.achievedAt?.split('T')[0] ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(record?.photoPath ?? null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertMilestoneRecord({
        recordId: record?.recordId ?? ulid(),
        childId,
        milestoneId: milestone.milestoneId,
        achievedAt: date ? new Date(date).toISOString() : isoNow(),
        ageMonthsWhenAchieved: ageMonths,
        notes: [notes.trim() || null, photoPreview ? `photo:${photoPreview}` : null].filter(Boolean).join('\n') || null,
        photoPath: null,
        now: isoNow(),
      });
      onSave();
      onClose();
    } catch { /* bridge unavailable */ }
    setSaving(false);
  };

  const handlePhoto = async (file: File | null) => {
    if (!file) { setPhotoPreview(null); return; }
    try { setPhotoPreview(await readImageFileAsDataUrl(file)); } catch { /* ignore */ }
  };

  const dm = DOMAIN_MAP.get(milestone.domain as MilestoneDomain);

  return (
    <HealthRecordModalShell open size="S" onClose={onClose}>
      <ModalHeader title={milestone.title} icon={dm?.emoji ?? '🎯'} onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--nimi-text-muted)]">{milestone.description}</p>
          <div>
            <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Milestone.recordModal.achievedDate')}</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Milestone.recordModal.storyWithIcon')}</label>
            <TextareaField value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={i18nText('Milestone.recordModal.storyPlaceholder')}
              className="w-full" rows={3} />
          </div>
          <div>
            <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Milestone.recordModal.photo')}</label>
            <input type="file" accept="image/*" className="text-[14px]"
              onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)} />
            {photoPreview && <img src={photoPreview} alt="" className="mt-2 h-24 rounded-2xl object-cover" />}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button onClick={onClose} tone="ghost" size="md">{i18nText('Milestone.recordModal.cancel')}</Button>
        <Button onClick={() => void handleSave()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('Milestone.recordModal.saving') : i18nText('Milestone.recordModal.save')}
        </Button>
      </ModalFooter>
    </HealthRecordModalShell>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function MilestonePage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [records, setRecords] = useState<MilestoneRecordRow[]>([]);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'radar'>('timeline');
  const [pastExpanded, setPastExpanded] = useState(false);

  useEffect(() => {
    if (activeChildId) getMilestoneRecords(activeChildId).then(setRecords).catch(catchLog('milestone', 'action:load-milestone-records-failed'));
  }, [activeChildId]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Milestone.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const isArchive = ageMonths > 72; // 6+ years: read-only archive view
  const recordMap = new Map(records.map((r) => [r.milestoneId, r]));
  const achievedCount = records.filter((r) => r.achievedAt).length;

  const reload = () => { getMilestoneRecords(child.childId).then(setRecords).catch(catchLog('milestone', 'action:reload-milestone-records-failed')); };

  const handleQuickCheck = async (milestoneId: string) => {
    const existing = recordMap.get(milestoneId);
    try {
      await upsertMilestoneRecord({
        recordId: existing?.recordId ?? ulid(),
        childId: child.childId, milestoneId,
        achievedAt: isoNow(),
        ageMonthsWhenAchieved: ageMonths,
        notes: existing?.notes ?? null,
        photoPath: existing?.photoPath ?? null,
        now: isoNow(),
      });
      reload();
    } catch { /* bridge unavailable */ }
  };

  const handleUnachieve = async (milestoneId: string) => {
    const rec = recordMap.get(milestoneId);
    if (!rec) return;
    try {
      await upsertMilestoneRecord({
        recordId: rec.recordId, childId: child.childId, milestoneId,
        achievedAt: null, ageMonthsWhenAchieved: null, notes: null, photoPath: null, now: isoNow(),
      });
      reload();
    } catch { /* bridge unavailable */ }
  };

  /* ── Radar data ─────────────────────────────────────────── */
  const radarData = useMemo(() => DOMAINS.map((d) => {
    const ms = MILESTONE_CATALOG.filter((m) => m.domain === d.key);
    const achieved = ms.filter((m) => recordMap.get(m.milestoneId)?.achievedAt).length;
    return { label: d.label, pct: ms.length > 0 ? Math.round((achieved / ms.length) * 100) : 0 };
  }), [recordMap]);

  /* ── Timeline: group milestones by age buckets ──────────── */
  const ageBuckets = useMemo(() => {
    const buckets: AgeBucket[] = [];
    const ranges = [
      [0, 3, i18nText('Milestone.ageBucket.m0_3')],
      [4, 6, i18nText('Milestone.ageBucket.m4_6')],
      [7, 9, i18nText('Milestone.ageBucket.m7_9')],
      [10, 12, i18nText('Milestone.ageBucket.m10_12')],
      [13, 18, i18nText('Milestone.ageBucket.m13_18')],
      [19, 24, i18nText('Milestone.ageBucket.m19_24')],
      [25, 36, i18nText('Milestone.ageBucket.y2_3')],
      [37, 48, i18nText('Milestone.ageBucket.y3_4')],
      [49, 60, i18nText('Milestone.ageBucket.y4_5')],
      [61, 72, i18nText('Milestone.ageBucket.y5_6')],
      [73, 96, i18nText('Milestone.ageBucket.y6_8')],
      [97, 120, i18nText('Milestone.ageBucket.y8_10')],
      [121, 144, i18nText('Milestone.ageBucket.y10_12')],
      [145, 180, i18nText('Milestone.ageBucket.y12_15')],
      [181, 216, i18nText('Milestone.ageBucket.y15_18')],
    ] as const;
    for (const [s, e, lbl] of ranges) {
      const ms = MILESTONE_CATALOG.filter((m) => m.typicalAge.medianMonths >= s && m.typicalAge.medianMonths <= e);
      if (ms.length > 0) buckets.push({ startMonth: s, endMonth: e, label: lbl, milestones: ms });
    }
    return buckets;
  }, []);

  /* ── Split buckets into past / current / future ─────────── */
  const { pastBuckets, currentBucket, futureBuckets } = useMemo(() => {
    const past: typeof ageBuckets = [];
    let cur: typeof ageBuckets[number] | null = null;
    const future: typeof ageBuckets = [];
    for (const b of ageBuckets) {
      if (ageMonths > b.endMonth) past.push(b);
      else if (ageMonths >= b.startMonth && ageMonths <= b.endMonth) cur = b;
      else future.push(b);
    }
    return { pastBuckets: past, currentBucket: cur, futureBuckets: future };
  }, [ageBuckets, ageMonths]);

  const pastSummary = useMemo(() => {
    const totalMs = pastBuckets.reduce((n, b) => n + b.milestones.length, 0);
    const achievedMs = pastBuckets.reduce((n, b) => n + b.milestones.filter((m) => recordMap.get(m.milestoneId)?.achievedAt).length, 0);
    return { total: totalMs, achieved: achievedMs };
  }, [pastBuckets, recordMap]);
  const pastPendingCount = Math.max(0, pastSummary.total - pastSummary.achieved);

  /* ── Upcoming milestones (±3 months from current age) ──── */
  const upcoming = useMemo(() =>
    MILESTONE_CATALOG.filter((m) => {
      if (recordMap.get(m.milestoneId)?.achievedAt) return false;
      return ageMonths >= m.typicalAge.rangeStart - 3 && ageMonths <= m.typicalAge.rangeEnd + 3;
    }).slice(0, 5),
  [ageMonths, recordMap]);

  const editTarget = editingMilestone ? MILESTONE_CATALOG.find((m) => m.milestoneId === editingMilestone) : null;

  return (
    <ProfileDetailShell
      title={
        <span className="flex items-center gap-2">
          <span>{isArchive ? i18nText('Milestone.page.archiveTitle') : i18nText('Milestone.page.title')}</span>
          <span className="group relative inline-flex">
            <span className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center cursor-help transition-colors hover:bg-[var(--nimi-action-ghost-hover)] text-[var(--nimi-text-muted)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <Surface
              tone="overlay"
              material="glass-thick"
              elevation="floating"
              padding="none"
              className="pointer-events-none absolute left-0 top-7 z-50 w-[340px] rounded-xl p-4 text-[13px] leading-relaxed opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
            >
              <p className="text-[14px] font-semibold text-[var(--nimi-text-primary)] mb-2.5">{i18nText('Milestone.sources.title')}</p>
              <ul className="space-y-2.5">
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Milestone.sources.coreDomains')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Milestone.sources.cdc')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-subtle)]">{i18nText('Milestone.sources.cdcCitation')}</span>
                </li>
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Milestone.sources.socialSelfCare')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Milestone.sources.asq')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-subtle)]">{i18nText('Milestone.sources.asqCitation')}</span>
                </li>
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Milestone.sources.chinaReference')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Milestone.sources.chinaReferenceDetail')}</span>
                </li>
              </ul>
              <p className="text-[12px] mt-2.5 pt-2 border-t border-[var(--nimi-border-subtle)] text-[var(--nimi-text-subtle)]">{i18nText('Milestone.sources.note')}</p>
            </Surface>
          </span>
        </span>
      }
      actions={
        <span className="text-[14px] px-3 py-1 rounded-full bg-[var(--nimi-surface-active)] text-[var(--nimi-action-primary-bg)]">
          {i18nText('Milestone.page.achievedCount', { achieved: achievedCount, total: MILESTONE_CATALOG.length })}
        </span>
      }
      aiSummary={
        <AISummaryCard domain="milestone" childName={child.displayName} childId={child.childId}
          ageLabel={i18nText('Milestone.summary.ageYearsMonths', {
            years: Math.floor(ageMonths / 12),
            months: ageMonths % 12,
          })} gender={child.gender}
          dataContext={achievedCount > 0
            ? i18nText('Milestone.summary.context', {
              achieved: achievedCount,
              total: MILESTONE_CATALOG.length,
              domains: DOMAINS.map((d) => {
              const ms = MILESTONE_CATALOG.filter((m) => m.domain === d.key);
              const ac = ms.filter((m) => recordMap.get(m.milestoneId)?.achievedAt).length;
              return `${d.label}: ${ac}/${ms.length}`;
            }).join(', '),
            })
            : ''} />
      }
    >
      {/* Upcoming milestones, hidden in archive mode. */}
      {!isArchive && upcoming.length > 0 && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="md" className="mb-5 rounded-3xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[16px]">🔔</span>
            <h3 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Milestone.page.upcomingTitle')}</h3>
          </div>
          <div className="space-y-2">
            {upcoming.map((m) => {
              const rec = recordMap.get(m.milestoneId);
              const achieved = !!rec?.achievedAt;
              return (
                <div
                  key={m.milestoneId}
                  className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-[var(--nimi-surface-active)] ${
                    achieved
                      ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-active)]'
                      : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-muted)]'
                  }`}
                >
                  {/* Check circle — quick toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); void (achieved ? handleUnachieve(m.milestoneId) : handleQuickCheck(m.milestoneId)); }}
                    className={`w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all ${
                      achieved
                        ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
                        : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                    }`}
                    title={achieved ? i18nText('Milestone.record.undoAchieved') : i18nText('Milestone.record.markAchieved')}>
                    {achieved && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-medium ${achieved ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>{m.title}</p>
                    <p className="text-[12px] text-[var(--nimi-text-muted)]">
                      {achieved ? i18nText('Milestone.record.achievedOn', { date: formatAchievedDate(rec?.achievedAt) }) : i18nText('Milestone.record.typicalSummary', { start: formatAge(m.typicalAge.rangeStart), end: formatAge(m.typicalAge.rangeEnd), description: m.description.slice(0, 30) })}
                    </p>
                  </div>
                  <button onClick={() => setEditingMilestone(m.milestoneId)}
                    className="text-[12px] shrink-0 rounded-full border border-[var(--nimi-border-subtle)] px-2.5 py-1 text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
                    📝 {achieved ? i18nText('Milestone.record.addStory') : i18nText('Milestone.record.record')}
                  </button>
                </div>
              );
            })}
          </div>
        </Surface>
      )}

      {/* ── View toggle: Timeline / Radar ────────────────────── */}
      <div className="flex gap-1 rounded-full bg-[var(--nimi-surface-muted)] p-1 mb-5 w-fit">
        {([['timeline', i18nText('Milestone.tab.timeline')], ['radar', i18nText('Milestone.tab.radar')]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${
              activeTab === k
                ? 'bg-[var(--nimi-surface-card)] text-[var(--nimi-text-primary)] shadow-sm'
                : 'text-[var(--nimi-text-muted)]'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 3. Radar chart view ──────────────────────────────── */}
      {activeTab === 'radar' && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="md" className="mb-5 rounded-3xl">
          <h3 className="text-[14px] font-semibold mb-2 text-center text-[var(--nimi-text-primary)]">{i18nText('Milestone.page.radarTitle')}</h3>
          <RadarChart data={radarData} />
          <div className="grid grid-cols-3 gap-2 mt-4">
            {radarData.map((d) => (
              <div key={d.label} className="flex items-center gap-2 rounded-2xl bg-[var(--nimi-surface-muted)] p-2">
                <div className="w-2 h-2 rounded-full bg-[var(--nimi-action-primary-bg)]" />
                <span className="text-[13px] text-[var(--nimi-text-primary)]">{d.label}</span>
                <span className="text-[13px] font-bold ml-auto text-[var(--nimi-text-primary)]">{d.pct}%</span>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {/* ── 1. Timeline view ─────────────────────────────────── */}
      {activeTab === 'timeline' && isArchive && (
        <div className="relative">
          <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />
          {ageBuckets.map((bucket) => {
            const bucketAchieved = bucket.milestones.filter((m) => recordMap.get(m.milestoneId)?.achievedAt).length;
            return (
              <div key={bucket.label} className="relative pl-10 pb-6">
                <div
                  className={`absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center bg-[var(--nimi-surface-card)] ${
                    bucketAchieved > 0 ? 'border-[var(--nimi-action-primary-bg)]' : 'border-[var(--nimi-border-subtle)]'
                  }`}
                >
                  {bucketAchieved > 0 && <div className="w-[6px] h-[6px] rounded-full bg-[var(--nimi-action-primary-bg)]" />}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{bucket.label}</span>
                  <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--nimi-surface-active)] text-[var(--nimi-action-primary-bg)]">
                    {bucketAchieved}/{bucket.milestones.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {bucket.milestones.map((m) => {
                    const rec = recordMap.get(m.milestoneId);
                    const achieved = !!rec?.achievedAt;
                    return (
                      <div
                        key={m.milestoneId}
                        className={`flex items-center gap-2.5 rounded-2xl border p-2.5 ${
                          achieved
                            ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-active)]'
                            : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                        }`}
                      >
                        {/* Static icon — no toggle in archive mode */}
                        {achieved ? (
                          <div className="w-[20px] h-[20px] rounded-full flex items-center justify-center shrink-0 bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]">
                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                          </div>
                        ) : (
                          <div className="w-[20px] h-[20px] rounded-full border-[1.5px] border-[var(--nimi-border-subtle)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] font-medium ${achieved ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-muted)]'}`}>{m.title}</p>
                          <p className="text-[12px] truncate text-[var(--nimi-text-muted)]">
                            {achieved ? i18nText('Milestone.record.achievedOn', { date: formatAchievedDate(rec?.achievedAt) }) : i18nText('Milestone.record.notRecorded')}
                          </p>
                        </div>
                        <button
                          onClick={() => setEditingMilestone(m.milestoneId)}
                          className="text-[12px] shrink-0 rounded-full border border-[var(--nimi-border-subtle)] px-2.5 py-1 text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
                          📝 {achieved ? i18nText('Milestone.record.addStory') : i18nText('Milestone.record.backfill')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'timeline' && !isArchive && (
        <div className="space-y-5">
          {pastBuckets.length > 0 && (
            <Surface as="section" tone="card" material="glass-regular" elevation="raised" padding="md" className="rounded-3xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nimi-surface-active)] text-[16px]"
                    >
                      🗂️
                    </span>
                    <span className="text-[14px] font-semibold tracking-[0.08em] text-[var(--nimi-action-primary-bg)]">
                      {i18nText('Milestone.archive.eyebrow')}
                    </span>
                  </div>
                  <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                    {i18nText('Milestone.archive.title')}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--nimi-text-muted)]">
                    {i18nText('Milestone.archive.rangeFootprint', {
                      start: pastBuckets[0]!.label,
                      end: pastBuckets[pastBuckets.length - 1]!.label,
                    })}
                  </p>
                </div>

                <Button
                  onClick={() => setPastExpanded(!pastExpanded)}
                  tone="secondary"
                  size="sm"
                  className="gap-2"
                >
                  {pastExpanded ? i18nText('Milestone.archive.collapse') : i18nText('Milestone.archive.expand')}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className={`shrink-0 transition-transform duration-200 ${pastExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full bg-[var(--nimi-surface-active)] px-3 py-1 text-[12px] font-medium text-[var(--nimi-action-primary-bg)]">
                  {i18nText('Milestone.archive.pastStages', { count: pastBuckets.length })}
                </div>
                <div className="rounded-full bg-[var(--nimi-surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--nimi-text-primary)]">
                  {i18nText('Milestone.archive.recordedCount', { achieved: pastSummary.achieved, total: pastSummary.total })}
                </div>
                <div className="rounded-full bg-[color-mix(in_srgb,var(--nimi-status-warning)_15%,transparent)] px-3 py-1 text-[12px] font-medium text-[var(--nimi-status-warning)]">
                  {i18nText('Milestone.archive.pendingCount', { count: pastPendingCount })}
                </div>
              </div>

              {pastExpanded && (
                <div className="mt-5 space-y-3">
                  {pastBuckets.slice().reverse().map((bucket) => {
                    const bucketAchieved = bucket.milestones.filter((m) => recordMap.get(m.milestoneId)?.achievedAt).length;
                    const bucketPending = bucket.milestones.length - bucketAchieved;

                    return (
                      <Surface
                        key={bucket.label}
                        tone="card"
                        material="solid"
                        elevation="base"
                        padding="md"
                        className={`rounded-2xl border ${
                          bucketPending === 0
                            ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-active)]'
                            : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">
                              {bucket.label}
                            </span>
                            <span
                              className="rounded-full border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] px-2.5 py-1 text-[12px] font-medium text-[var(--nimi-text-primary)]"
                            >
                              {i18nText('Milestone.archive.recordedCount', { achieved: bucketAchieved, total: bucket.milestones.length })}
                            </span>
                            {bucketPending > 0 && (
                              <span
                                className="rounded-full bg-[color-mix(in_srgb,var(--nimi-status-warning)_15%,transparent)] px-2.5 py-1 text-[12px] font-medium text-[var(--nimi-status-warning)]"
                              >
                                {i18nText('Milestone.archive.bucketPending', { count: bucketPending })}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[var(--nimi-text-muted)]">
                            {bucketPending > 0 ? i18nText('Milestone.archive.bucketHasPending') : i18nText('Milestone.archive.bucketComplete')}
                          </p>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {bucket.milestones.map((m) => {
                            const rec = recordMap.get(m.milestoneId);
                            const achieved = !!rec?.achievedAt;
                            const dm = DOMAIN_MAP.get(m.domain as MilestoneDomain);
                            return (
                              <div
                                key={m.milestoneId}
                                className={`group flex items-center gap-3 rounded-2xl border p-3 transition-all duration-150 ${
                                  achieved
                                    ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-card)]'
                                    : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-muted)]'
                                }`}
                              >
                                {/* Check circle — quick toggle */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); void (achieved ? handleUnachieve(m.milestoneId) : handleQuickCheck(m.milestoneId)); }}
                                  className={`w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all ${
                                    achieved
                                      ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
                                      : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                                  }`}
                                  title={achieved ? i18nText('Milestone.record.undoAchieved') : i18nText('Milestone.record.markAchieved')}>
                                  {achieved && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className={`text-[14px] font-medium ${achieved ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>
                                      {m.title}
                                    </p>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[12px] font-medium text-[var(--nimi-text-primary)] ${dm?.toneClass ?? 'bg-[var(--nimi-surface-muted)]'}`}
                                    >
                                      {dm?.label ?? i18nText('Milestone.page.milestoneFallback')}
                                    </span>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-[var(--nimi-text-muted)]">
                                    {achieved ? i18nText('Milestone.record.achievedOn', { date: formatAchievedDate(rec?.achievedAt) }) : m.description}
                                  </p>
                                </div>

                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingMilestone(m.milestoneId); }}
                                  className="text-[12px] shrink-0 rounded-full border border-[var(--nimi-border-subtle)] px-2.5 py-1 text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
                                  📝 {achieved ? i18nText('Milestone.record.addStory') : i18nText('Milestone.record.record')}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </Surface>
                    );
                  })}
                </div>
              )}
            </Surface>
          )}

          {(currentBucket || futureBuckets.length > 0) && (
            <div className="relative">
              <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />

              {/* ── Current stage ───────────────────────────────── */}
              {currentBucket && (
                <div className="relative pl-10 pb-6">
                  <div className="absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)]" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-bold text-[var(--nimi-action-primary-bg)]">{currentBucket.label}</span>
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]">{i18nText('Milestone.page.currentStage')}</span>
                  </div>
                  <div className="space-y-1.5">
                    {currentBucket.milestones.map((m) => {
                      const rec = recordMap.get(m.milestoneId);
                      const achieved = !!rec?.achievedAt;
                      return (
                        <div
                          key={m.milestoneId}
                          className={`group flex items-center gap-2.5 rounded-2xl border p-2.5 transition-all duration-150 hover:shadow-sm ${
                            achieved
                              ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-active)]'
                              : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                          }`}
                        >
                          {/* Check circle — quick toggle */}
                          <button
                            onClick={(e) => { e.stopPropagation(); void (achieved ? handleUnachieve(m.milestoneId) : handleQuickCheck(m.milestoneId)); }}
                            className={`w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all ${
                              achieved
                                ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
                                : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'
                            }`}
                            title={achieved ? i18nText('Milestone.record.undoAchieved') : i18nText('Milestone.record.markAchieved')}>
                            {achieved && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
                          </button>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[14px] font-medium ${achieved ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>{m.title}</p>
                            <p className="text-[12px] truncate text-[var(--nimi-text-muted)]">
                              {achieved ? i18nText('Milestone.record.achievedOn', { date: formatAchievedDate(rec?.achievedAt) }) : m.description}
                            </p>
                          </div>
                          {/* Detail record button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingMilestone(m.milestoneId); }}
                            className="text-[12px] shrink-0 rounded-full border border-[var(--nimi-border-subtle)] px-2.5 py-1 text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
                            📝 {achieved ? i18nText('Milestone.record.addStory') : i18nText('Milestone.record.record')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Future stages ───────────────────────────────── */}
              {futureBuckets.map((bucket) => (
                <div key={bucket.label} className="relative pl-10 pb-6 opacity-40">
                  <div className="absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-muted)]" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{bucket.label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {bucket.milestones.map((m) => {
                      const dm = DOMAIN_MAP.get(m.domain as MilestoneDomain);
                      return (
                        <div key={m.milestoneId}
                          className="flex items-center gap-2.5 rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] p-2.5">
                          <div className={`w-[28px] h-[28px] rounded-lg flex items-center justify-center text-[16px] shrink-0 ${dm?.toneClass ?? 'bg-[var(--nimi-surface-muted)]'}`}>
                            {dm?.emoji ?? '🎯'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{m.title}</p>
                            <p className="text-[12px] truncate text-[var(--nimi-text-muted)]">{m.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Record modal ─────────────────────────────────────── */}
      {editTarget && (
        <RecordModal
          milestone={editTarget}
          record={recordMap.get(editTarget.milestoneId)}
          childId={child.childId}
          ageMonths={ageMonths}
          onSave={reload}
          onClose={() => setEditingMilestone(null)}
        />
      )}
    </ProfileDetailShell>
  );
}
