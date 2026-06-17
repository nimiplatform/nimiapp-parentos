import { Button, IconButton, Surface } from '@nimiplatform/kit/ui';
import { useState } from 'react';
import { i18nText } from '../../i18n/index.js';


/* ── Guide data ── */

interface GuideSection {
  heading?: string;
  body?: string;
  items?: Array<{ label: string; desc: string; tag?: string }>;
  table?: Array<{ field: string; meaning: string; note: string }>;
  warning?: { title: string; body: string };
}

interface GuideStep {
  title: string;
  sections: GuideSection[];
}

const GUIDE_STEPS: GuideStep[] = [
  {
    title: i18nText('PostureGuide.steps.why.title'),
    sections: [
      {
        heading: i18nText('PostureGuide.steps.why.early.heading'),
        body: i18nText('PostureGuide.steps.why.early.body'),
      },
      {
        heading: i18nText('PostureGuide.steps.why.parentActions.heading'),
        items: [
          {
            label: i18nText('PostureGuide.steps.why.parentActions.regularObservation.label'),
            desc: i18nText('PostureGuide.steps.why.parentActions.regularObservation.desc'),
            tag: i18nText('PostureGuide.tag.recommended'),
          },
          {
            label: i18nText('PostureGuide.steps.why.parentActions.signalWatch.label'),
            desc: i18nText('PostureGuide.steps.why.parentActions.signalWatch.desc'),
            tag: i18nText('PostureGuide.tag.daily'),
          },
          {
            label: i18nText('PostureGuide.steps.why.parentActions.checkupData.label'),
            desc: i18nText('PostureGuide.steps.why.parentActions.checkupData.desc'),
            tag: i18nText('PostureGuide.tag.important'),
          },
        ],
      },
    ],
  },
  {
    title: i18nText('PostureGuide.steps.observe.title'),
    sections: [
      {
        heading: i18nText('PostureGuide.steps.observe.preparation.heading'),
        body: i18nText('PostureGuide.steps.observe.preparation.body'),
      },
      {
        heading: i18nText('PostureGuide.steps.observe.fourSteps.heading'),
        items: [
          {
            label: i18nText('PostureGuide.steps.observe.fourSteps.shoulder.label'),
            desc: i18nText('PostureGuide.steps.observe.fourSteps.shoulder.desc'),
            tag: i18nText('PostureGuide.tag.simple'),
          },
          {
            label: i18nText('PostureGuide.steps.observe.fourSteps.scapula.label'),
            desc: i18nText('PostureGuide.steps.observe.fourSteps.scapula.desc'),
            tag: i18nText('PostureGuide.tag.important'),
          },
          {
            label: i18nText('PostureGuide.steps.observe.fourSteps.adam.label'),
            desc: i18nText('PostureGuide.steps.observe.fourSteps.adam.desc'),
            tag: i18nText('PostureGuide.tag.key'),
          },
          {
            label: i18nText('PostureGuide.steps.observe.fourSteps.symmetry.label'),
            desc: i18nText('PostureGuide.steps.observe.fourSteps.symmetry.desc'),
          },
        ],
      },
      {
        heading: i18nText('PostureGuide.steps.observe.photo.heading'),
        body: i18nText('PostureGuide.steps.observe.photo.body'),
      },
    ],
  },
  {
    title: i18nText('PostureGuide.steps.cobb.title'),
    sections: [
      {
        heading: i18nText('PostureGuide.steps.cobb.definition.heading'),
        body: i18nText('PostureGuide.steps.cobb.definition.body'),
      },
      {
        heading: i18nText('PostureGuide.steps.cobb.grading.heading'),
        table: [
          {
            field: i18nText('PostureGuide.steps.cobb.grading.normal.field'),
            meaning: i18nText('PostureGuide.steps.cobb.grading.normal.meaning'),
            note: i18nText('PostureGuide.steps.cobb.grading.normal.note'),
          },
          {
            field: i18nText('PostureGuide.steps.cobb.grading.mild.field'),
            meaning: i18nText('PostureGuide.steps.cobb.grading.mild.meaning'),
            note: i18nText('PostureGuide.steps.cobb.grading.mild.note'),
          },
          {
            field: i18nText('PostureGuide.steps.cobb.grading.moderate.field'),
            meaning: i18nText('PostureGuide.steps.cobb.grading.moderate.meaning'),
            note: i18nText('PostureGuide.steps.cobb.grading.moderate.note'),
          },
          {
            field: i18nText('PostureGuide.steps.cobb.grading.severe.field'),
            meaning: i18nText('PostureGuide.steps.cobb.grading.severe.meaning'),
            note: i18nText('PostureGuide.steps.cobb.grading.severe.note'),
          },
        ],
      },
      {
        heading: i18nText('PostureGuide.steps.cobb.source.heading'),
        body: i18nText('PostureGuide.steps.cobb.source.body'),
      },
    ],
  },
  {
    title: i18nText('PostureGuide.steps.footArch.title'),
    sections: [
      {
        heading: i18nText('PostureGuide.steps.footArch.why.heading'),
        body: i18nText('PostureGuide.steps.footArch.why.body'),
      },
      {
        heading: i18nText('PostureGuide.steps.footArch.wetFootprint.heading'),
        items: [
          {
            label: i18nText('PostureGuide.steps.footArch.wetFootprint.prepare.label'),
            desc: i18nText('PostureGuide.steps.footArch.wetFootprint.prepare.desc'),
            tag: i18nText('PostureGuide.tag.simple'),
          },
          {
            label: i18nText('PostureGuide.steps.footArch.wetFootprint.observe.label'),
            desc: i18nText('PostureGuide.steps.footArch.wetFootprint.observe.desc'),
          },
          {
            label: i18nText('PostureGuide.steps.footArch.wetFootprint.compare.label'),
            desc: i18nText('PostureGuide.steps.footArch.wetFootprint.compare.desc'),
            tag: i18nText('PostureGuide.tag.key'),
          },
        ],
      },
      {
        heading: i18nText('PostureGuide.steps.footArch.daily.heading'),
        items: [
          {
            label: i18nText('PostureGuide.steps.footArch.daily.wear.label'),
            desc: i18nText('PostureGuide.steps.footArch.daily.wear.desc'),
            tag: i18nText('PostureGuide.tag.daily'),
          },
          {
            label: i18nText('PostureGuide.steps.footArch.daily.fatigue.label'),
            desc: i18nText('PostureGuide.steps.footArch.daily.fatigue.desc'),
          },
          {
            label: i18nText('PostureGuide.steps.footArch.daily.gait.label'),
            desc: i18nText('PostureGuide.steps.footArch.daily.gait.desc'),
          },
        ],
      },
      {
        heading: i18nText('PostureGuide.steps.footArch.dataSource.heading'),
        body: i18nText('PostureGuide.steps.footArch.dataSource.body'),
      },
    ],
  },
  {
    title: i18nText('PostureGuide.steps.care.title'),
    sections: [
      {
        heading: i18nText('PostureGuide.steps.care.signals.heading'),
        items: [
          {
            label: i18nText('PostureGuide.steps.care.signals.shoulderOrWaist.label'),
            desc: i18nText('PostureGuide.steps.care.signals.shoulderOrWaist.desc'),
            tag: i18nText('PostureGuide.tag.early'),
          },
          {
            label: i18nText('PostureGuide.steps.care.signals.adamProminence.label'),
            desc: i18nText('PostureGuide.steps.care.signals.adamProminence.desc'),
            tag: i18nText('PostureGuide.tag.attention'),
          },
          {
            label: i18nText('PostureGuide.steps.care.signals.cobbProgress.label'),
            desc: i18nText('PostureGuide.steps.care.signals.cobbProgress.desc'),
            tag: i18nText('PostureGuide.tag.followUp'),
          },
          {
            label: i18nText('PostureGuide.steps.care.signals.cobbRapidIncrease.label'),
            desc: i18nText('PostureGuide.steps.care.signals.cobbRapidIncrease.desc'),
            tag: i18nText('PostureGuide.tag.urgent'),
          },
          {
            label: i18nText('PostureGuide.steps.care.signals.footArch.label'),
            desc: i18nText('PostureGuide.steps.care.signals.footArch.desc'),
            tag: i18nText('PostureGuide.tag.footArch'),
          },
        ],
      },
      {
        heading: i18nText('PostureGuide.steps.care.department.heading'),
        body: i18nText('PostureGuide.steps.care.department.body'),
      },
      {
        warning: {
          title: i18nText('PostureGuide.steps.care.growthSpurt.title'),
          body: i18nText('PostureGuide.steps.care.growthSpurt.body'),
        },
      },
    ],
  },
];

/* ── Component ── */

export function PostureGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = GUIDE_STEPS[step];
  if (!current) return null;

  return (
    <Surface tone="card" elevation="raised" padding="none" className="mb-5 overflow-hidden rounded-3xl">
      {/* Step header */}
      <div className="bg-[image:var(--nimi-surface-hero)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] text-white/60">{i18nText('PostureGuide.ui.eyebrow')}</span>
          <IconButton
            aria-label={i18nText('PostureGuide.ui.close')}
            icon="✕"
            onClick={onClose}
            size="sm"
            tone="ghost"
            className="h-6 min-h-6 w-6 border-transparent text-white/60 hover:bg-white/10 hover:text-white"
          />
        </div>
        <h3 className="text-[16px] font-bold text-white mb-3">{current.title}</h3>
        {/* Step indicators */}
        <div className="flex items-center gap-1">
          {GUIDE_STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`h-[6px] rounded-full transition-all ${i === step ? 'w-6 bg-white' : 'w-[6px] bg-white/30 hover:bg-white/50'}`} />
          ))}
          <span className="text-[12px] text-white/50 ml-2">{step + 1}/{GUIDE_STEPS.length}</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-5 bg-[var(--nimi-surface-card)] p-5">
        {current.sections.map((sec, si) => (
          <div key={si}>
            {'heading' in sec && sec.heading && (
              <h4 className="text-[14px] font-semibold mb-2 text-[var(--nimi-text-primary)]">{sec.heading}</h4>
            )}

            {'body' in sec && sec.body && (
              <p className="text-[14px] leading-relaxed text-[var(--nimi-text-muted)]">{sec.body}</p>
            )}

            {'items' in sec && sec.items && (
              <div className="space-y-2">
                {sec.items.map((item, ii) => (
                  <div key={ii} className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{item.label}</span>
                      {item.tag && (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)] px-1.5 py-0.5 text-[12px] text-[var(--nimi-action-primary-bg)]">{item.tag}</span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {'table' in sec && sec.table && (
              <div className="overflow-hidden rounded-2xl border border-[var(--nimi-border-subtle)]">
                <div className="grid grid-cols-[0.8fr_1fr_1.5fr] bg-[var(--nimi-surface-panel)] px-3 py-2 text-[12px] font-medium text-[var(--nimi-text-muted)]">
                  <span>{i18nText('PostureGuide.table.angle')}</span><span>{i18nText('PostureGuide.table.grade')}</span><span>{i18nText('PostureGuide.table.suggestion')}</span>
                </div>
                {sec.table.map((row, ri) => (
                  <div
                    key={ri}
                    className={`grid grid-cols-[0.8fr_1fr_1.5fr] border-t border-[var(--nimi-border-subtle)] px-3 py-2 text-[13px] ${ri % 2 === 0 ? 'bg-[var(--nimi-surface-card)]' : 'bg-[var(--nimi-surface-panel)]'}`}
                  >
                    <span className="font-semibold text-[var(--nimi-action-primary-bg)]">{row.field}</span>
                    <span className="text-[var(--nimi-text-primary)]">{row.meaning}</span>
                    <span className="text-[var(--nimi-text-muted)]">{row.note}</span>
                  </div>
                ))}
              </div>
            )}

            {'warning' in sec && sec.warning && (
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--nimi-status-warning)_35%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] px-4 py-3">
                <p className="text-[14px] font-semibold mb-1 text-[var(--nimi-text-primary)]">{sec.warning.title}</p>
                <p className="text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{sec.warning.body}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-5 py-3">
        <Button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} tone="ghost" size="sm" className="disabled:opacity-30">
          {i18nText('PostureGuide.ui.previous')}
        </Button>
        {step < GUIDE_STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} tone="primary" size="sm" className="rounded-2xl">
            {i18nText('PostureGuide.ui.next')}
          </Button>
        ) : (
          <Button onClick={onClose} tone="primary" size="sm" className="rounded-2xl">
            {i18nText('PostureGuide.ui.done')}
          </Button>
        )}
      </div>
    </Surface>
  );
}
