import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Surface, cn } from '@nimiplatform/kit/ui';
import { primaryStages, pubicHairStages } from './tanner-page-shared.js';
import { TANNER_AXIS_TONE, tannerAxisLabel, type TannerAxisKey } from './tanner-record-parts.js';
import { i18nText } from '../../i18n/index.js';

const STEP_KEYS = [
  'Tanner.redesign.stages',
  'Tanner.redesign.howToRecord',
  'Tanner.entryGuide.support',
] as const;

// Same segmented-pill look as the archive history filters.
const TRACK_CLASS =
  'rounded-full border border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-border-subtle)_45%,transparent)]';

const CODE_CHIP_CLASS: Record<TannerAxisKey, string> = {
  primary: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)]',
  pubic: 'bg-[color-mix(in_srgb,var(--nimi-color-indigo)_10%,transparent)]',
};

/** General education, kept apart from the child's recorded facts. */
// @nimi-authority: rule.parentos.prof.r012
export function TannerGuidePanel({
  isFemale,
  onClose,
}: {
  isFemale: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [axis, setAxis] = useState<TannerAxisKey>('primary');
  const stages = axis === 'pubic' ? pubicHairStages(isFemale) : primaryStages(isFemale);
  return (
    <Surface
      as="section"
      id="tanner-entry-guide"
      aria-label={i18nText('Tanner.page.guideToggle')}
      tone="card"
      material="glass-thick"
      elevation="raised"
      padding="lg"
      className="relative mb-6 rounded-3xl"
    >
      <button
        type="button"
        aria-label={i18nText('Tanner.entryGuide.close')}
        onClick={onClose}
        className="absolute right-4 top-4 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)] hover:text-[var(--nimi-text-primary)]"
      >
        <X size={16} />
      </button>
      <header className="pr-10">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--nimi-text-primary)]">
          <BookOpen size={15} strokeWidth={1.8} className="text-[var(--nimi-action-primary-bg)]" />
          {i18nText('Tanner.entryGuide.title')}
        </p>
        <h2
          aria-live="polite"
          className="mt-2.5 text-[18px] font-semibold tracking-[-0.01em] text-[var(--nimi-text-primary)]"
        >
          {i18nText(STEP_KEYS[step]!)}
        </h2>
        <nav className="mt-2 flex items-center gap-1" aria-label={i18nText('Tanner.page.guideToggle')}>
          {STEP_KEYS.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => setStep(index)}
              aria-label={i18nText(key)}
              aria-current={index === step ? 'step' : undefined}
              className="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded border-0 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--nimi-action-primary-bg)]"
            >
              <span
                className={
                  index === step
                    ? 'h-1.5 w-6 rounded-full bg-[var(--nimi-action-primary-bg)]'
                    : 'h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_30%,transparent)]'
                }
              />
            </button>
          ))}
          <span className="ml-2 font-mono text-[11px] text-[var(--nimi-text-muted)]">
            {step + 1}/{STEP_KEYS.length}
          </span>
        </nav>
      </header>

      <div className="mt-4 text-[13px] leading-[1.8] text-[var(--nimi-text-secondary)]">
        {step === 0 ? (
          <>
            <p>{i18nText('Tanner.redesign.guideIntro')}</p>
            <p className="mt-1 text-[var(--nimi-text-muted)]">
              {i18nText('Tanner.redesign.stageReferenceOnly')}
            </p>
            <div
              role="group"
              aria-label={i18nText('Tanner.redesign.stages')}
              className={cn('mt-4 inline-flex gap-0.5 p-[3px]', TRACK_CLASS)}
            >
              {(['primary', 'pubic'] as const).map((key) => {
                const active = axis === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAxis(key)}
                    className={`cursor-pointer rounded-full border-0 px-3.5 py-1.5 text-[12px] transition-all ${active ? 'bg-[var(--nimi-surface-card)] font-semibold text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'bg-transparent font-normal text-[var(--nimi-text-muted)]'}`}
                  >
                    {tannerAxisLabel(key, isFemale)}
                  </button>
                );
              })}
            </div>
            <ul className="m-0 mt-4 list-none space-y-3.5 p-0">
              {stages.map((stage) => (
                <li key={stage.stage} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 grid h-8 min-w-10 shrink-0 place-items-center rounded-xl px-2 text-[13px] font-bold tabular-nums',
                      CODE_CHIP_CLASS[axis],
                      TANNER_AXIS_TONE[axis].text,
                    )}
                  >
                    {stage.code}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-semibold leading-6 text-[var(--nimi-text-primary)]">
                      {stage.name}
                    </h4>
                    <p className="text-[12.5px] leading-[1.7]">{stage.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <details className="mt-5 rounded-2xl bg-[color-mix(in_srgb,var(--nimi-text-primary)_4%,transparent)] px-4 py-2.5 text-[12px]">
              <summary className="cursor-pointer text-[12.5px] font-medium text-[var(--nimi-text-secondary)]">
                {i18nText('Tanner.page.reference.title')}
              </summary>
              <p className="mt-2">{i18nText('Tanner.page.reference.tannerCitation')}</p>
              <p className="text-[var(--nimi-text-muted)]">
                {i18nText('Tanner.page.reference.tannerJournal')}
              </p>
            </details>
          </>
        ) : step === 1 ? (
          <>
            <p>{i18nText('Tanner.redesign.recordGuideIntro')}</p>
            <ol className="m-0 mt-4 list-none space-y-3 p-0">
              {(
                [
                  'Tanner.redesign.recordStep1',
                  'Tanner.redesign.recordStep2',
                  'Tanner.redesign.recordStep3',
                ] as const
              ).map((key, index) => (
                <li key={key} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--nimi-accent-soft)] text-[12px] font-semibold text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_65%,var(--nimi-text-primary))]"
                  >
                    {index + 1}
                  </span>
                  <span className="text-[13px] text-[var(--nimi-text-primary)]">
                    {i18nText(key)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <section className="rounded-2xl bg-[color-mix(in_srgb,var(--nimi-text-primary)_4%,transparent)] px-4 py-3.5">
                <h3 className="text-[13.5px] font-semibold text-[var(--nimi-text-primary)]">
                  {i18nText('Tanner.redesign.communication')}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.75]">
                  {i18nText('Tanner.redesign.communicationBody')}
                </p>
              </section>
              <section className="rounded-2xl bg-[color-mix(in_srgb,var(--nimi-text-primary)_4%,transparent)] px-4 py-3.5">
                <h3 className="text-[13.5px] font-semibold text-[var(--nimi-text-primary)]">
                  {i18nText('Tanner.redesign.professional')}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.75]">
                  {i18nText('Tanner.redesign.professionalBody')}
                </p>
              </section>
            </div>
            <p className="mt-3 text-[11.5px] text-[var(--nimi-text-muted)]">
              {i18nText('Tanner.referenceNotes.disclaimer')}
            </p>
          </>
        )}
      </div>

      <footer className="mt-6 flex items-center justify-between">
        <Button tone="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={14} />
          {i18nText('Tanner.entryGuide.previous')}
        </Button>
        {step < STEP_KEYS.length - 1 ? (
          <Button tone="primary" size="sm" onClick={() => setStep(step + 1)}>
            {i18nText('Tanner.entryGuide.next')}
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button tone="primary" size="sm" onClick={onClose}>
            {i18nText('Tanner.page.guide.confirm')}
          </Button>
        )}
      </footer>
    </Surface>
  );
}
