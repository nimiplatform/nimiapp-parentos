import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, StatusBadge, Surface } from '@nimiplatform/kit/ui';
import { i18nText } from '../../i18n/index.js';


export interface ObservationFocusData {
  dimensionId: string;
  displayName: string;
  parentQuestion: string;
  observableSignals: string[];
  guidedQuestions: string[];
  experiment: string | null;
}

export interface ObservationFocusOption {
  dimensionId: string;
  displayName: string;
  parentQuestion: string;
}

const SIGNAL_PREVIEW_COUNT = 4;
const QUESTION_PREVIEW_COUNT = 3;

// @nimi-authority: rule.parentos.jour.r002
export function ObservationFocusPanel({
  focus,
  options,
  onSwitchDimension,
  onClose,
}: {
  focus: ObservationFocusData;
  options: ObservationFocusOption[];
  onSwitchDimension: (dimensionId: string) => void;
  onClose?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const switchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSignalsExpanded(false);
    setQuestionsExpanded(false);
  }, [focus.dimensionId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handle = (event: MouseEvent) => {
      if (!switchRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', escape);
    };
  }, [pickerOpen]);

  const otherOptions = options.filter((option) => option.dimensionId !== focus.dimensionId);
  const canSwitch = otherOptions.length > 0;

  const hiddenSignalCount = focus.observableSignals.length - SIGNAL_PREVIEW_COUNT;
  const collapseSignals = hiddenSignalCount > 1;
  const visibleSignals = collapseSignals && !signalsExpanded
    ? focus.observableSignals.slice(0, SIGNAL_PREVIEW_COUNT)
    : focus.observableSignals;

  const hiddenQuestionCount = focus.guidedQuestions.length - QUESTION_PREVIEW_COUNT;
  const collapseQuestions = hiddenQuestionCount > 1;
  const visibleQuestions = collapseQuestions && !questionsExpanded
    ? focus.guidedQuestions.slice(0, QUESTION_PREVIEW_COUNT)
    : focus.guidedQuestions;

  return (
    <Surface
      tone="panel"
      elevation="base"
      padding="md"
      className="mx-5 mt-5 mb-2 parentos-radius-14 border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_16%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_6%,var(--nimi-surface-panel))]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--nimi-action-primary-bg)]">{i18nText('Journal.focus.topic')}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-[var(--nimi-text-primary)]">{focus.displayName}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{focus.parentQuestion}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div ref={switchRef} className="relative">
            <Button
              type="button"
              onClick={() => canSwitch && setPickerOpen((value) => !value)}
              disabled={!canSwitch}
              tone="ghost"
              size="sm"
              className="min-h-0 parentos-radius-full px-2.5 py-1 text-[12px]"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
            >
              {i18nText('Journal.focus.switch')}
            </Button>

            {pickerOpen ? (
              <Surface
                role="menu"
                tone="overlay"
                elevation="floating"
                padding="none"
                className="absolute right-0 top-[calc(100%+4px)] z-30 w-[260px] overflow-hidden parentos-radius-md py-1.5"
              >
                <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-[var(--nimi-text-muted)]">
                  {i18nText('Journal.focus.switchMenu')}
                </p>
                <div className="max-h-[260px] overflow-y-auto">
                  {otherOptions.map((option) => (
                    <button
                      key={option.dimensionId}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPickerOpen(false);
                        onSwitchDimension(option.dimensionId);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_8%,transparent)]"
                    >
                      <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">{option.displayName}</span>
                      <span className="line-clamp-1 text-[12px] text-[var(--nimi-text-muted)]">{option.parentQuestion}</span>
                    </button>
                  ))}
                </div>
              </Surface>
            ) : null}
          </div>

          {onClose ? (
            <IconButton
              type="button"
              onClick={onClose}
              tone="ghost"
              size="sm"
              className="h-7 min-h-0 w-7 parentos-radius-full text-[var(--nimi-text-muted)]"
              aria-label={i18nText('Journal.focus.close')}
              title={i18nText('Journal.focus.close')}
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              }
            >
            </IconButton>
          ) : null}
        </div>
      </div>

      {focus.observableSignals.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-medium text-[var(--nimi-action-primary-bg)]">{i18nText('Journal.focus.observableSignals')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleSignals.map((signal, i) => (
              <StatusBadge key={i} tone="neutral" className="parentos-radius-full bg-[var(--nimi-surface-card)] px-2.5 py-1 text-[12px] text-[var(--nimi-text-primary)]">
                {signal}
              </StatusBadge>
            ))}
            {collapseSignals ? (
              <button
                type="button"
                onClick={() => setSignalsExpanded((value) => !value)}
                aria-expanded={signalsExpanded}
                className="parentos-radius-full border border-dashed border-[var(--nimi-border-strong)] bg-transparent px-2.5 py-0.5 text-[12px] text-[var(--nimi-text-muted)] transition-colors hover:border-[var(--nimi-action-primary-bg)] hover:text-[var(--nimi-action-primary-bg)]"
              >
                {signalsExpanded
                  ? i18nText('Journal.focus.showLess')
                  : i18nText('Journal.focus.signalsMore', { count: hiddenSignalCount })}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {focus.guidedQuestions.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-medium text-[var(--nimi-action-primary-bg)]">{i18nText('Journal.focus.guidedQuestions')}</p>
          <div className="space-y-1">
            {visibleQuestions.map((q, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-[var(--nimi-text-primary)]">
                {i + 1}. {q}
              </p>
            ))}
          </div>
          {collapseQuestions ? (
            <button
              type="button"
              onClick={() => setQuestionsExpanded((value) => !value)}
              aria-expanded={questionsExpanded}
              className="mt-1.5 text-[12px] font-medium text-[var(--nimi-action-primary-bg)] transition-colors hover:underline"
            >
              {questionsExpanded
                ? i18nText('Journal.focus.showLess')
                : i18nText('Journal.focus.questionsMore', { count: hiddenQuestionCount })}
            </button>
          ) : null}
        </div>
      ) : null}

      {focus.experiment ? (
        <Surface tone="card" elevation="base" padding="sm" className="mt-3 parentos-radius-sm bg-[color-mix(in_srgb,var(--nimi-status-warning)_8%,var(--nimi-surface-card))] px-3 py-2.5">
          <p className="mb-1 text-[12px] font-medium text-[var(--nimi-status-warning)]">{i18nText('Journal.focus.experiment')}</p>
          <p className="text-[13px] leading-relaxed text-[var(--nimi-text-primary)]">{focus.experiment}</p>
        </Surface>
      ) : null}
    </Surface>
  );
}
