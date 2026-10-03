import { Button } from '@nimiplatform/kit/ui';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { i18nText } from '../../i18n/index.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { HERO_ACCENT_TEXT, HERO_CTA_CLASS, OutdoorHeroNote } from './outdoor-goal-onboarding.js';
import {
  DEFAULT_OUTDOOR_GOAL_MINUTES,
  MAX_OUTDOOR_GOAL_MINUTES,
  OUTDOOR_GOAL_DAILY_PRESETS,
  stepOutdoorGoalMinutes,
} from './outdoor-helpers.js';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

/** Digits only, no leading zeros, capped at the minutes in a week. */
function normalizeGoalDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  return digits === '' ? '' : String(Math.min(MAX_OUTDOOR_GOAL_MINUTES, Number(digits)));
}

/**
 * Weekly outdoor goal picker, shown in the illustrated hero's copy column:
 * a large stepper whose taps move the goal by ten minutes a day, quick picks
 * framed as time per day, and a hand-typed value for anything else.
 */
export function OutdoorGoalSetup({ initialMinutes, onSave, onCancel }: {
  initialMinutes: number;
  onSave: (minutes: number) => Promise<void>;
  /** Omitted on first-time setup, where there is no goal to fall back to. */
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(String(initialMinutes));
  // Last valid goal, restored when the field is left empty.
  const [lastValid, setLastValid] = useState(initialMinutes);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const minutes = draft === '' ? 0 : Number(draft);
  const valid = minutes > 0;
  const current = valid ? minutes : lastValid;
  const canDecrease = stepOutdoorGoalMinutes(current, -1) !== current;
  const canIncrease = stepOutdoorGoalMinutes(current, 1) !== current;
  const dailyMinutes = Math.round(minutes / 7);
  const dailyAverage = i18nText('Outdoor.page.goalSetup.dailyAverage', { minutes: dailyMinutes });

  const changeDraft = (next: string) => {
    setDraft(next);
    if (Number(next) > 0) setLastValid(Number(next));
    setSaveFailed(false);
  };

  const step = (direction: 1 | -1) => changeDraft(String(stepOutdoorGoalMinutes(current, direction)));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    step(event.key === 'ArrowUp' ? 1 : -1);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await onSave(minutes);
    } catch (error) {
      catchLog('outdoor', 'action:save-goal-failed')(error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Rises in when it replaces the guide; the hero art stays put.
    <form noValidate onSubmit={handleSubmit} className="parentos-onboarding-enter-left flex flex-col">
      <p className={`text-[12px] font-medium uppercase tracking-[0.1em] ${HERO_ACCENT_TEXT}`}>
        {i18nText('Outdoor.page.goalSetup.eyebrow')}
      </p>
      {/* Capped so a long (en) question wraps before it reaches the child. */}
      <h2 className="mt-3 max-w-[26rem] text-balance text-[34px] font-bold leading-[1.15] tracking-normal text-[var(--nimi-text-primary)] sm:text-[40px]">
        {i18nText('Outdoor.page.goalSetup.title')}
      </h2>
      <p className="mt-3.5 max-w-[21rem] text-pretty text-[16px] leading-[1.55] tracking-normal text-[var(--nimi-text-secondary)]">
        {i18nText('Outdoor.page.goalSetup.tagline')}
      </p>

      <div className="mt-8 flex w-fit flex-col items-center">
        <div className="flex items-center gap-1 rounded-full bg-white/80 p-2 shadow-[0_18px_40px_-24px_rgba(34,94,160,0.55)] ring-1 ring-white transition-shadow has-[input:focus]:ring-[length:var(--nimi-focus-ring-width)] has-[input:focus]:ring-[color:var(--nimi-focus-ring-color)]">
          <GoalStepButton
            label={i18nText('Outdoor.page.goalSetup.decrease')}
            disabled={!canDecrease}
            onClick={() => step(-1)}
          >
            <Minus size={20} strokeWidth={2.25} aria-hidden="true" />
          </GoalStepButton>
          <input
            value={draft}
            onChange={(event) => changeDraft(normalizeGoalDraft(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => { if (!valid) setDraft(String(lastValid)); }}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            autoComplete="off"
            role="spinbutton"
            aria-label={i18nText('Outdoor.page.goalSetup.inputAria')}
            aria-valuemin={1}
            aria-valuemax={MAX_OUTDOOR_GOAL_MINUTES}
            aria-valuenow={valid ? minutes : undefined}
            aria-valuetext={valid ? i18nText('Outdoor.page.goalSetup.valueText', { weekly: minutes, daily: dailyMinutes }) : undefined}
            style={{ width: `${Math.max(4, draft.length) + 0.6}ch` }}
            className="bg-transparent text-center text-[52px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[var(--nimi-text-primary)] caret-[var(--nimi-action-primary-bg)] outline-none"
          />
          <GoalStepButton
            label={i18nText('Outdoor.page.goalSetup.increase')}
            disabled={!canIncrease}
            onClick={() => step(1)}
          >
            <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
          </GoalStepButton>
        </div>
        <p className="mt-3 text-[14px] text-[var(--nimi-text-muted)]">
          {i18nText('Outdoor.page.goalSetup.minutesPerWeek')}
          {valid ? (
            <>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className={`font-medium ${HERO_ACCENT_TEXT}`}>{dailyAverage}</span>
            </>
          ) : null}
        </p>
      </div>

      <div role="group" aria-label={i18nText('Outdoor.page.goalSetup.presetsAria')} className="mt-6 flex flex-wrap gap-x-2 gap-y-3">
        {OUTDOOR_GOAL_DAILY_PRESETS.map((presetDailyMinutes) => {
          const weeklyMinutes = presetDailyMinutes * 7;
          const active = minutes === weeklyMinutes;
          return (
            <button
              key={presetDailyMinutes}
              type="button"
              aria-pressed={active}
              onClick={() => changeDraft(String(weeklyMinutes))}
              className={`relative min-h-10 cursor-pointer rounded-full px-4 text-[13px] transition-[background-color,box-shadow,color] duration-150 ${FOCUS_RING} ${active
                ? 'bg-white font-semibold text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))] shadow-[inset_0_0_0_1.5px_var(--nimi-action-primary-bg),0_8px_20px_-14px_rgba(34,94,160,0.6)]'
                : 'bg-white/55 font-medium text-[var(--nimi-text-secondary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_9%,transparent)] hover:bg-white/85 hover:text-[var(--nimi-text-primary)]'}`}
            >
              {i18nText('Outdoor.page.goalSetup.dailyPreset', { hours: presetDailyMinutes / 60 })}
              {weeklyMinutes === DEFAULT_OUTDOOR_GOAL_MINUTES ? (
                <>
                  {/* Keeps the badge a separate word in the accessible name; it's out of flow visually. */}
                  {' '}
                  <span className="absolute -right-1.5 -top-2.5 rounded-full bg-[var(--nimi-action-primary-bg)] px-1.5 py-px text-[10.5px] font-medium leading-[16px] text-[var(--nimi-action-primary-text)] shadow-[0_2px_6px_-2px_rgba(34,94,160,0.5)]">
                    {i18nText('Outdoor.page.goalSetup.suggested')}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          tone="primary"
          size="lg"
          loading={saving}
          disabled={!valid}
          trailingIcon={<ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
          className={HERO_CTA_CLASS}
        >
          {i18nText('Outdoor.page.goalSetup.confirm')}
        </Button>
        {onCancel ? (
          <Button tone="ghost" size="lg" onClick={onCancel} className="min-h-11 rounded-full px-5 text-[15px] font-medium">
            {i18nText('Outdoor.page.goalSetup.cancel')}
          </Button>
        ) : null}
      </div>
      {saveFailed ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--nimi-status-danger)]">
          {i18nText('Outdoor.page.goalSetup.saveFailed')}
        </p>
      ) : null}

      <OutdoorHeroNote className="mt-9 ml-3">
        {i18nText('Outdoor.page.goalSetup.note')}
      </OutdoorHeroNote>
    </form>
  );
}

function GoalStepButton({ label, disabled, onClick, children }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--nimi-accent-soft)] ${HERO_ACCENT_TEXT} transition-[background-color,transform,opacity] duration-150 hover:bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_24%,transparent)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-[var(--nimi-accent-soft)] ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
