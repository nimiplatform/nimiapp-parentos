import { Surface } from '@nimiplatform/kit/ui';
import {
  PERM_LOWER_L,
  PERM_LOWER_R,
  PERM_UPPER_L,
  PERM_UPPER_R,
  PRIMARY_LOWER_L,
  PRIMARY_LOWER_R,
  PRIMARY_UPPER_L,
  PRIMARY_UPPER_R,
  TOOTH_NAMES,
} from './dental-page-domain.js';
import { i18nText } from '../../i18n/index.js';


export function ToothChart({
  selectedTeeth,
  onToggle,
  toothSet,
  recordedTeeth,
}: {
  selectedTeeth: string[];
  onToggle: (id: string) => void;
  toothSet: 'primary' | 'permanent';
  recordedTeeth: Map<string, string>;
}) {
  const isPrimary = toothSet === 'primary';
  const upperRight = isPrimary ? PRIMARY_UPPER_R : PERM_UPPER_R;
  const upperLeft = isPrimary ? PRIMARY_UPPER_L : PERM_UPPER_L;
  const lowerLeft = isPrimary ? PRIMARY_LOWER_L : PERM_LOWER_L;
  const lowerRight = isPrimary ? PRIMARY_LOWER_R : PERM_LOWER_R;
  const selected = new Set(selectedTeeth);

  const toothClassName = (id: string) => {
    if (selected.has(id)) return 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]';
    const eventType = recordedTeeth.get(id);
    if (eventType === 'caries') return 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_20%,var(--nimi-surface-card))] text-[var(--nimi-status-danger)]';
    if (eventType === 'loss') return 'bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-secondary)]';
    if (eventType === 'eruption') return 'bg-[color-mix(in_srgb,var(--nimi-status-success)_18%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]';
    if (eventType === 'filling' || eventType === 'sealant') return 'bg-[color-mix(in_srgb,var(--nimi-status-info)_16%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]';
    return 'bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-primary)]';
  };

  const renderRow = (teeth: string[], label: string) => (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 w-8 text-right text-[12px] text-[var(--nimi-text-muted)]">{label}</span>
      {teeth.map((id) => {
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            title={`${id} ${TOOTH_NAMES[id] ?? ''}`}
            className={`h-7 w-7 rounded-lg text-[12px] font-bold transition-all hover:scale-110 ${toothClassName(id)}`}
          >
            {id}
          </button>
        );
      })}
    </div>
  );

  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">
          {isPrimary ? i18nText('Dental.toothChart.primaryTitle') : i18nText('Dental.toothChart.permanentTitle')}
        </p>
        <div className="flex gap-1">
          {[
            { className: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_18%,var(--nimi-surface-card))]', label: i18nText('Dental.eventType.eruption.label') },
            { className: 'bg-[var(--nimi-surface-panel)]', label: i18nText('Dental.eventType.loss.label') },
            { className: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_20%,var(--nimi-surface-card))]', label: i18nText('Dental.eventType.caries.label') },
            { className: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_16%,var(--nimi-surface-card))]', label: i18nText('Dental.toothStatus.treated') },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-0.5 text-[12px] text-[var(--nimi-text-muted)]">
              <span className={`h-2 w-2 rounded-sm ${item.className}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Dental.toothQuadrant.upperShort')}</p>
        <div className="flex gap-1">
          {renderRow(upperRight, i18nText('Dental.toothQuadrant.right'))}
          <span className="w-3" />
          {renderRow(upperLeft, '')}
          <span className="ml-1 w-8 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Dental.toothQuadrant.left')}</span>
        </div>
        <div className="my-1 h-px w-full bg-[var(--nimi-border-subtle)]" />
        <div className="flex gap-1">
          {renderRow(lowerRight, i18nText('Dental.toothQuadrant.right'))}
          <span className="w-3" />
          {renderRow(lowerLeft, '')}
          <span className="ml-1 w-8 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Dental.toothQuadrant.left')}</span>
        </div>
        <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Dental.toothQuadrant.lowerShort')}</p>
      </div>
      {selectedTeeth.length > 0 ? (
        <p className="mt-2 text-center text-[13px] font-medium text-[var(--nimi-action-primary-bg)]">
          {i18nText('Dental.toothChart.selectedSummary', {
            count: selectedTeeth.length,
            teeth: selectedTeeth.map((id) => `${id}(${TOOTH_NAMES[id] ?? ''})`).join(i18nText('Dental.toothLabel.separator')),
          })}
        </p>
      ) : null}
    </Surface>
  );
}
