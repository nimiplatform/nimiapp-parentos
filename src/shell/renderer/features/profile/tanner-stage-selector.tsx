import { useId } from 'react';
import type { StageDesc } from './tanner-page-shared.js';

type TannerStageSelectorProps = {
  stages: StageDesc[];
  value: number | null;
  onChange: (stage: number) => void;
  label: string;
};

export function TannerStageSelector({ stages, value, onChange, label }: TannerStageSelectorProps) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-semibold text-[var(--nimi-text-primary)]">
        {label}
      </legend>
      <div className="space-y-2">
        {stages.map((stage) => (
          <label
            key={stage.stage}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--nimi-border-subtle)] p-3 transition-colors has-[:checked]:border-[var(--nimi-action-primary-bg)] has-[:checked]:bg-[var(--nimi-surface-panel)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--nimi-action-primary-bg)]"
          >
            <input
              type="radio"
              name={name}
              value={stage.stage}
              checked={value === stage.stage}
              onChange={() => onChange(stage.stage)}
              className="mt-1 shrink-0 accent-[var(--nimi-action-primary-bg)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--nimi-text-primary)]">
                {stage.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--nimi-text-secondary)]">
                {stage.desc}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
