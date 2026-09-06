import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Bone, BookOpen, ChevronDown, Eye, Mic, Moon, Ruler, Sparkles, Syringe, Trophy } from 'lucide-react';
import { type ChildProfile } from '../../app-shell/app-store.js';
import { ChildAvatar } from '../../shared/child-avatar.js';
import {
  buildQuickLinks,
  describeNurtureMode,
  formatAgeLabel,
  type RecentChangeIconName,
  type RecentChangeItem,
  type StageInsightItem,
  type StageInsightSummary,
} from './timeline-data.js';
import { Cd, Hdr, textMain, textMuted, textSoft } from './timeline-card-primitives.js';
import growthIcon from '../profile/assets/archive-icons/growth.png';
import visionIcon from '../profile/assets/archive-icons/vision.png';
import fitnessIcon from '../profile/assets/archive-icons/fitness.png';
import dentalIcon from '../profile/assets/archive-icons/dental.png';
import heightIcon from '../profile/assets/archive-icons/height.png';
import milestonesIcon from '../profile/assets/archive-icons/milestones.png';
import vaccinesIcon from '../profile/assets/archive-icons/vaccines.png';
import allergiesIcon from '../profile/assets/archive-icons/allergies.png';
import sleepIcon from '../profile/assets/archive-icons/sleep.png';
import medicalIcon from '../profile/assets/archive-icons/medical.png';
import postureIcon from '../profile/assets/archive-icons/posture.png';
import outdoorIcon from '../profile/assets/archive-icons/outdoor.png';
import smartScanIcon from '../profile/assets/archive-icons/smart-scan.png';
import journalQuickLinkIcon from './assets/journal-quick-link.png';
import { i18nText } from '../../i18n/index.js';


const ICON_BY_DOMAIN: Record<RecentChangeIconName, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  moon: Moon,
  book: BookOpen,
  mic: Mic,
  sparkle: Sparkles,
  trophy: Trophy,
  syringe: Syringe,
  ruler: Ruler,
  eye: Eye,
  bone: Bone,
};

const ICON_TONE: Record<RecentChangeIconName, { bg: string; fg: string }> = {
  moon: { bg: 'rgba(129,140,248,0.14)', fg: '#6366f1' },
  book: { bg: 'rgba(251,146,60,0.14)', fg: '#ea580c' },
  mic: { bg: 'rgba(244,114,182,0.14)', fg: '#db2777' },
  sparkle: { bg: 'rgba(251,191,36,0.16)', fg: '#d97706' },
  trophy: { bg: 'rgba(78,204,163,0.16)', fg: '#059669' },
  syringe: { bg: 'rgba(251,191,36,0.14)', fg: '#d97706' },
  ruler: { bg: 'rgba(78,204,163,0.14)', fg: '#059669' },
  eye: { bg: 'rgba(96,165,250,0.14)', fg: '#2563eb' },
  bone: { bg: 'rgba(148,163,184,0.18)', fg: '#475569' },
};

const _ICON_TINT: Record<string, string> = {
  '📏': 'rgba(78,204,163,0.12)',
  '💉': 'rgba(251,191,36,0.10)',
  '😴': 'rgba(129,140,248,0.12)',
  '📝': 'rgba(251,146,60,0.10)',
  '📄': 'rgba(129,140,248,0.10)',
  '🏥': 'rgba(248,113,113,0.10)',
  '🎯': 'rgba(78,204,163,0.12)',
  '👁️': 'rgba(96,165,250,0.12)',
  '🦷': 'rgba(251,191,36,0.10)',
  '🏃': 'rgba(251,146,60,0.10)',
  '🌱': 'rgba(78,204,163,0.12)',
  '🧍': 'rgba(244,114,182,0.10)',
};

const QUICK_LINK_ICON_META: Record<string, { src: string; offsetX?: number; scale?: number; bg?: string }> = {
  growth: { src: growthIcon },
  vaccines: { src: vaccinesIcon, offsetX: -2 },
  sleep: { src: sleepIcon },
  journal: { src: journalQuickLinkIcon, offsetX: -3, scale: 1.18, bg: 'rgba(167, 139, 250, 0.12)' },
  reports: { src: smartScanIcon },
  medical: { src: medicalIcon, offsetX: -2, scale: 1.16 },
  milestones: { src: milestonesIcon },
  outdoor: { src: outdoorIcon },
  vision: { src: visionIcon },
  dental: { src: dentalIcon, offsetX: -4, scale: 1.2 },
  fitness: { src: fitnessIcon },
  tanner: { src: heightIcon, offsetX: -2.5 },
  posture: { src: postureIcon, scale: 1.14 },
  allergies: { src: allergiesIcon, offsetX: -2, scale: 1.16 },
};

const DEFAULT_QUICK_LINK_ICON_META: { src: string; offsetX?: number; scale?: number; bg?: string } = { src: smartScanIcon };
const PROFILE_MANUAL_CAPTURE_PATH = '/profile?capture=manual';

function QuickLinkIcon({ src, offsetX = 0, scale = 1, bg }: { src: string; offsetX?: number; scale?: number; bg?: string }) {
  return (
    <div
      className="mb-3 h-11 w-11 overflow-hidden rounded-xl transition-transform duration-200 group-hover:scale-110"
      style={{ background: bg, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="block h-full w-full object-cover"
        style={{ transform: `translateX(${offsetX}px) scale(${scale})` }}
      />
    </div>
  );
}

function RecentChangeIcon({ item, size = 18 }: { item: RecentChangeItem; size?: number }) {
  const key = item.iconName ?? 'book';
  const Icon = ICON_BY_DOMAIN[key] ?? BookOpen;
  const tone = ICON_TONE[key] ?? ICON_TONE.book;
  const box = size + 18;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: box, height: box, background: tone.bg, color: tone.fg }}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={1.75} />
    </span>
  );
}

function getProfileMeshBackground(gender: ChildProfile['gender']): string {
  if (gender === 'female') {
    return [
      'radial-gradient(at 22% 18%, rgba(255, 207, 226, 0.38) 0px, transparent 55%)',
      'radial-gradient(at 82% 22%, rgba(221, 214, 254, 0.32) 0px, transparent 55%)',
      'radial-gradient(at 30% 88%, rgba(255, 228, 240, 0.28) 0px, transparent 55%)',
      'radial-gradient(at 80% 85%, rgba(233, 213, 255, 0.22) 0px, transparent 55%)',
    ].join(', ');
  }
  return [
    'radial-gradient(at 22% 18%, rgba(186, 230, 253, 0.38) 0px, transparent 55%)',
    'radial-gradient(at 82% 22%, rgba(221, 214, 254, 0.30) 0px, transparent 55%)',
    'radial-gradient(at 30% 88%, rgba(207, 232, 252, 0.28) 0px, transparent 55%)',
    'radial-gradient(at 80% 85%, rgba(224, 231, 255, 0.22) 0px, transparent 55%)',
  ].join(', ');
}

export function ChildContextCard({ child, ageMonths }: { child: ChildProfile; ageMonths: number }) {
  const meshBackground = getProfileMeshBackground(child.gender);
  return (
    <div
      className="relative z-10 shrink-0"
      style={{
        width: 'min(240px, 100%)',
        borderRadius: 24,
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 14px rgba(15,23,42,0.04), 0 18px 36px rgba(15,23,42,0.04)',
      }}
    >
      <div className="relative flex h-full flex-col items-center overflow-hidden px-6 pb-6 pt-12" style={{ borderRadius: 24, isolation: 'isolate' }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: meshBackground, filter: 'blur(24px)', zIndex: 0 }} />
        <div
          className="relative nimi-material-glass-regular bg-[var(--nimi-material-glass-regular-bg)] border border-[var(--nimi-material-glass-regular-border)] backdrop-blur-[var(--nimi-backdrop-blur-regular)]"
          style={{ width: 120, height: 120, padding: 4, borderRadius: '50%', boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }}
          data-nimi-material="glass-regular"
          data-nimi-tone="card"
        >
          <ChildAvatar child={child} ageMonths={ageMonths} className="h-full w-full rounded-full object-cover" />
        </div>
        <div className="relative mt-6 max-w-full text-center">
          <h2 className="truncate text-[24px] font-semibold tracking-tight" style={{ color: '#1d1d1f', letterSpacing: '-0.3px' }}>
            {child.displayName}
          </h2>
          <p className="mt-1.5 text-[14px]" style={{ color: '#86868b' }}>
            {formatAgeLabel(ageMonths)} · {child.gender === 'female' ? i18nText('Timeline.gender.female') : i18nText('Timeline.gender.male')}
          </p>
        </div>
        <div className="relative mt-auto flex w-full flex-col items-center gap-3">
          <span className="inline-flex items-center rounded-full px-3 py-[5px] text-[13px] font-medium" style={{ background: 'rgba(52,199,89,0.12)', color: '#248a3d' }}>
            <span className="mr-1.5 inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#34c759' }} />
            {describeNurtureMode(child.nurtureMode)}
          </span>
          <Link to="/profile" className="flex w-full items-center justify-center whitespace-nowrap rounded-xl px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-black/[0.04]" style={{ color: '#1d1d1f' }}>
            {i18nText('Timeline.home.viewFullProfile')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 opacity-60">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

function RecentChangeLeadCell({ item }: { item: RecentChangeItem }) {
  return (
    <Link
      to={item.to}
      className="dashboard-inset dashboard-inset--interactive col-span-1 flex flex-col justify-center rounded-[22px] p-5 transition-all duration-200 hover:-translate-y-0.5 sm:col-span-3 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <RecentChangeIcon item={item} size={20} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: textSoft }}>
          {item.label}
        </span>
      </div>
      <p className="mt-5 text-[16px] font-semibold leading-snug" style={{ color: textMain, letterSpacing: '-0.1px' }}>{item.title}</p>
      {item.metric ? (
        <p className="mt-2 text-[48px] font-semibold leading-none tabular-nums" style={{ color: textMain, letterSpacing: '-1.4px' }}>
          {item.metric.value}
          {item.metric.unit ? <span className="ml-1.5 text-[18px] font-medium" style={{ color: textMuted }}>{item.metric.unit}</span> : null}
        </p>
      ) : null}
      {item.summary ? (
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.summary}
        </p>
      ) : null}
      <p className="mt-4 text-[13px] font-medium tabular-nums" style={{ color: textSoft }}>{item.subtitle ?? item.detail}</p>
    </Link>
  );
}

function RecentChangeSecondaryCell({ item }: { item: RecentChangeItem }) {
  return (
    <Link
      to={item.to}
      className="dashboard-inset dashboard-inset--interactive block rounded-[18px] p-4 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <RecentChangeIcon item={item} size={16} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold" style={{ color: textMain }}>{item.title}</p>
          {item.summary ? <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.summary}</p> : null}
          <p className="mt-1.5 text-[12px] tabular-nums" style={{ color: textSoft }}>{item.subtitle ?? item.detail}</p>
        </div>
      </div>
    </Link>
  );
}

export function RecentChangesHeroCard({ items }: { items: RecentChangeItem[] }) {
  const lead = items[0] ?? null;
  const secondary = items.slice(1);

  return (
    <Cd cls="min-w-0 flex-1 flex flex-col" material="glass-thick">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium tracking-[0.08em]" style={{ color: textSoft }}>{i18nText('Timeline.home.recentWindow')}</p>
          <h2 className="mt-1.5 text-[24px] font-semibold tracking-tight" style={{ color: textMain, letterSpacing: '-0.5px' }}>
            {i18nText('Timeline.home.recentChangesTitle')}
          </h2>
        </div>
        <Link to="/profile" className="text-[13px] font-medium transition-colors hover:text-[#1e293b]" style={{ color: textMuted }}>
          {i18nText('Timeline.home.viewProfile')}
        </Link>
      </div>

      {lead ? (
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-5">
          <RecentChangeLeadCell item={lead} />
          <div className="col-span-1 flex flex-col justify-center gap-3 sm:col-span-2">
            {secondary.map((item) => <RecentChangeSecondaryCell key={item.id} item={item} />)}
            {secondary.length === 0 ? (
              <div className="dashboard-inset flex flex-1 flex-col justify-center rounded-[18px] p-4">
                <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.recentNeedsMoreTitle')}</p>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>
                  {i18nText('Timeline.home.recentNeedsMoreBody')}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="dashboard-inset flex flex-1 flex-col justify-center rounded-[22px] p-7">
          <p className="text-[16px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.noRecentTitle')}</p>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: textMuted }}>
            {i18nText('Timeline.home.noRecentBody')}
          </p>
          <Link to={PROFILE_MANUAL_CAPTURE_PATH} className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:-translate-y-0.5" style={{ background: textMain, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
            {i18nText('Timeline.home.recordOne')} <span>→</span>
          </Link>
        </div>
      )}
    </Cd>
  );
}

function StageInsightGroup({ title, items, overflow }: { title: string; items: StageInsightItem[]; overflow: number }) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  return (
    <div className="dashboard-inset rounded-[18px] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: textSoft }}>{title}</p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const expanded = expandedRuleId === item.ruleId;
          return (
            <div key={item.ruleId}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedRuleId(expanded ? null : item.ruleId)}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-[rgba(15,23,42,0.04)]"
              >
                <span className="text-[14px] font-semibold" style={{ color: textMain }}>{item.title}</span>
                <ChevronDown
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-200${expanded ? ' rotate-180' : ''}`}
                  style={{ color: textMuted }}
                />
              </button>
              {expanded ? (
                <p className="px-2 pb-2 pt-0.5 text-[13px] leading-relaxed" style={{ color: textMuted }}>
                  {item.description}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {overflow > 0 ? (
        <Link to="/reminders" className="mt-4 inline-block text-[13px] font-medium transition-colors hover:text-[#1e293b]" style={{ color: textMuted }}>
          {i18nText('Timeline.home.stageInsightOverflow', { count: overflow })}
        </Link>
      ) : null}
    </div>
  );
}

// @nimi-authority: rule.parentos.time.r011
export function StageInsightCard({ summary }: { summary: StageInsightSummary }) {
  return (
    <Cd cls="min-w-0 flex-1" material="glass-thick">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium tracking-[0.08em]" style={{ color: textSoft }}>{i18nText('Timeline.home.stageFocusTitle')}</p>
          <h2 className="mt-1.5 text-[24px] font-semibold tracking-tight" style={{ color: textMain, letterSpacing: '-0.5px' }}>
            {i18nText('Timeline.home.stageInsightTitle', { ageLabel: summary.ageLabel })}
          </h2>
        </div>
        <Link to="/reminders" className="text-[13px] font-medium transition-colors hover:text-[#1e293b]" style={{ color: textMuted }}>
          {i18nText('Timeline.home.viewAllReminders')}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summary.health.length > 0 ? <StageInsightGroup title={i18nText('Timeline.home.stageInsightHealthGroup')} items={summary.health} overflow={summary.healthOverflow} /> : null}
        {summary.development.length > 0 ? <StageInsightGroup title={i18nText('Timeline.home.stageInsightDevGroup')} items={summary.development} overflow={summary.developmentOverflow} /> : null}
      </div>
    </Cd>
  );
}

// @nimi-authority: rule.parentos.time.r008
const GETTING_STARTED_STEPS = [
  { id: 'growth', titleKey: 'Timeline.home.coldStartStep1Title', bodyKey: 'Timeline.home.coldStartStep1Body', to: '/profile?capture=manual&group=growth' },
  { id: 'sleep', titleKey: 'Timeline.home.coldStartStep2Title', bodyKey: 'Timeline.home.coldStartStep2Body', to: '/profile?capture=manual&group=sleep' },
  { id: 'journal', titleKey: 'Timeline.home.coldStartStep3Title', bodyKey: 'Timeline.home.coldStartStep3Body', to: '/journal' },
] as const;

export function GettingStartedCard() {
  return (
    <Cd cls="col-span-8">
      <Hdr title={i18nText('Timeline.home.coldStartGuideTitle')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {GETTING_STARTED_STEPS.map((step, index) => (
          <div key={step.id} className="dashboard-inset flex flex-col rounded-[18px] p-5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ background: 'rgba(78,204,163,0.16)', color: '#059669' }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <p className="mt-3 text-[14px] font-semibold" style={{ color: textMain }}>{i18nText(step.titleKey)}</p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText(step.bodyKey)}</p>
            <Link
              to={step.to}
              className="mt-3 inline-flex self-start rounded-full px-4 py-1.5 text-[13px] font-medium text-white hover:-translate-y-0.5"
              style={{ background: textMain, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              {i18nText('Timeline.home.coldStartStepCta')}
            </Link>
          </div>
        ))}
      </div>
    </Cd>
  );
}

export function StageFocusCard({ periods }: { periods: Array<{ periodId: string; title: string; observableSigns: string[]; ageRange: { peakMonths: number } }> }) {
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.home.stageFocusTitle')} to="/reminders" link={i18nText('Timeline.home.viewAllReminders')} />
      {periods.length > 0 ? (
        <div className="space-y-4">
          {periods.slice(0, 2).map((period) => (
            <div key={period.periodId} className="dashboard-inset rounded-[16px] p-5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-600">{i18nText('Timeline.home.sensitivePeriodBadge')}</span>
                <p className="text-[14px] font-semibold" style={{ color: textMain }}>{period.title}</p>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: textMuted }}>{period.observableSigns[0] ?? i18nText('Timeline.home.stageFocusFallback')}</p>
              <Link to={`/journal?topic=${encodeURIComponent(period.title)}`}
                className="mt-3 inline-flex rounded-full px-4 py-1.5 text-[13px] font-medium text-white hover:-translate-y-0.5"
                style={{ background: textMain, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>{i18nText('Timeline.home.recordAction')}</Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.stageStableTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.home.stageStableBody')}</p>
        </div>
      )}
    </Cd>
  );
}

export function QuickLinksStrip({ ageMonths }: { ageMonths: number }) {
  const links = buildQuickLinks(ageMonths);
  return (
    <Cd cls="col-span-8">
      <Hdr title={i18nText('Timeline.home.quickLinksTitle')} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {links.map((item) => (
          (() => {
            const iconMeta = QUICK_LINK_ICON_META[item.id] ?? DEFAULT_QUICK_LINK_ICON_META;
            return (
              <Link key={item.id} to={item.to}
                className="dashboard-quick-link group flex flex-col items-center rounded-[20px] px-3 py-5 transition-all duration-200 hover:-translate-y-1">
                <QuickLinkIcon src={iconMeta.src} offsetX={iconMeta.offsetX} scale={iconMeta.scale} bg={iconMeta.bg} />
                <p className="text-[13px] font-semibold" style={{ color: textMain }}>{item.label}</p>
              </Link>
            );
          })()
        ))}
      </div>
    </Cd>
  );
}
