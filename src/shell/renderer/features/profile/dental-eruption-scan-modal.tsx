import { Button, cn, DatePicker, OverlayShell, StatusBadge, Surface } from '@nimiplatform/kit/ui';
import { useMemo, useState } from 'react';
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
import {
  type DentalEruptionCandidate,
  flipCandidatesHorizontally,
} from './dental-eruption-scan.js';
import { i18nText } from '../../i18n/index.js';


type Stage = 'upload' | 'analyzing' | 'review' | 'saving';

export interface DentalEruptionScanModalProps {
  show: boolean;
  onClose: () => void;
  onPickImage: () => Promise<void>;
  onAnalyze: () => Promise<void>;
  onConfirm: (input: {
    eventDate: string;
    selectedToothIds: string[];
    candidates: DentalEruptionCandidate[];
  }) => Promise<void>;
  onFlipCandidates: (next: DentalEruptionCandidate[]) => void;
  onRetake: () => void;
  previewUrl: string | null;
  candidates: DentalEruptionCandidate[];
  warnings: string[];
  stage: Stage;
  errorMessage: string | null;
  alreadyRecordedErupted: Set<string>;
  eventDate: string;
  onEventDateChange: (value: string) => void;
}

function renderToothRow(
  teeth: string[],
  label: string,
  candidateMap: Map<string, DentalEruptionCandidate>,
  selected: Set<string>,
  already: Set<string>,
  onToggle: (toothId: string) => void,
) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 w-8 text-right text-[12px] text-[var(--nimi-text-muted)]">{label}</span>
      {teeth.map((id) => {
        const candidate = candidateMap.get(id);
        const isSelected = selected.has(id);
        const wasAlready = already.has(id);
        const className = pickToothClassName({ candidate, isSelected, wasAlready });
        const confidenceHint = candidate
          ? i18nText('DentalEruptionScan.tooth.confidenceHint', { confidence: (candidate.confidence * 100).toFixed(0) })
          : '';
        const historyHint = wasAlready ? i18nText('DentalEruptionScan.tooth.historyHint') : '';
        return (
          <button
            key={id}
            type="button"
            onClick={() => candidate && onToggle(id)}
            disabled={!candidate}
            title={i18nText('DentalEruptionScan.tooth.title', { id, name: TOOTH_NAMES[id] ?? '', confidenceHint, historyHint })}
            className={className}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}

function pickToothClassName(input: {
  candidate: DentalEruptionCandidate | undefined;
  isSelected: boolean;
  wasAlready: boolean;
}): string {
  const { candidate, isSelected, wasAlready } = input;
  const base = 'h-7 w-7 rounded-lg border text-[12px] font-bold transition-all hover:scale-105 disabled:cursor-default disabled:hover:scale-100';
  if (!candidate) {
    if (wasAlready) {
      return cn(base, 'border-transparent bg-[var(--nimi-surface-active)] text-[var(--nimi-text-muted)] opacity-80');
    }
    return cn(base, 'border-transparent bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-muted)] opacity-60');
  }
  if (isSelected) {
    return cn(base, 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]');
  }
  return cn(
    base,
    'border-dashed border-[color-mix(in_srgb,var(--nimi-status-warning)_45%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]',
  );
}

export function DentalEruptionScanModal(props: DentalEruptionScanModalProps) {
  const [toothSet, setToothSet] = useState<'primary' | 'permanent'>('primary');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const candidateMap = useMemo(() => {
    const map = new Map<string, DentalEruptionCandidate>();
    for (const candidate of props.candidates) map.set(candidate.toothId, candidate);
    return map;
  }, [props.candidates]);

  const selected = useMemo(() => {
    const next = new Set<string>();
    for (const candidate of props.candidates) {
      if (!deselected.has(candidate.toothId)) next.add(candidate.toothId);
    }
    return next;
  }, [props.candidates, deselected]);

  const isPrimary = toothSet === 'primary';
  const upperRight = isPrimary ? PRIMARY_UPPER_R : PERM_UPPER_R;
  const upperLeft = isPrimary ? PRIMARY_UPPER_L : PERM_UPPER_L;
  const lowerLeft = isPrimary ? PRIMARY_LOWER_L : PERM_LOWER_L;
  const lowerRight = isPrimary ? PRIMARY_LOWER_R : PERM_LOWER_R;

  const toggleTooth = (toothId: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(toothId)) next.delete(toothId);
      else next.add(toothId);
      return next;
    });
  };

  const selectAllVisible = (select: boolean) => {
    const pool = new Set([...upperRight, ...upperLeft, ...lowerLeft, ...lowerRight]);
    setDeselected((prev) => {
      const next = new Set(prev);
      for (const candidate of props.candidates) {
        if (!pool.has(candidate.toothId)) continue;
        if (select) next.delete(candidate.toothId);
        else next.add(candidate.toothId);
      }
      return next;
    });
  };

  const handleFlip = () => {
    const flipped = flipCandidatesHorizontally(props.candidates);
    const remap = new Set<string>();
    for (const id of deselected) {
      const mirrored = findFlippedId(id);
      if (mirrored) remap.add(mirrored);
    }
    setDeselected(remap);
    props.onFlipCandidates(flipped);
  };

  const handleReset = () => {
    setDeselected(new Set());
  };

  const handleConfirm = async () => {
    await props.onConfirm({
      eventDate: props.eventDate,
      selectedToothIds: [...selected],
      candidates: props.candidates,
    });
  };

  const primaryCount = props.candidates.filter((c) => c.type === 'primary' && selected.has(c.toothId)).length;
  const permanentCount = props.candidates.filter((c) => c.type === 'permanent' && selected.has(c.toothId)).length;

  if (!props.show) return null;

  return (
    <OverlayShell
      open
      kind="dialog"
      onClose={props.onClose}
      closeOnBackdrop={false}
      panelClassName="max-h-[90vh] w-full max-w-[640px] overflow-auto rounded-3xl"
      contentClassName="!p-0"
    >
        <div className="flex items-center justify-between border-b border-[var(--nimi-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('DentalEruptionScan.title')}</h2>
            <p className="mt-0.5 text-[13px] text-[var(--nimi-text-muted)]">
              {i18nText('DentalEruptionScan.subtitle')}
            </p>
          </div>
          <Button
            onClick={props.onClose}
            tone="ghost"
            size="sm"
            className="h-7 min-h-7 w-7 rounded-full px-0 text-[18px] leading-none"
            aria-label={i18nText('DentalEruptionScan.action.close')}
          >
            ×
          </Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {props.errorMessage ? (
            <div
              className="rounded-2xl border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-3 py-2 text-[14px] text-[var(--nimi-status-danger)]"
            >
              {props.errorMessage}
            </div>
          ) : null}

          {props.stage === 'upload' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{i18nText('DentalEruptionScan.upload.title')}</p>
              <p className="max-w-[420px] text-[13px] text-[var(--nimi-text-muted)]">
                {i18nText('DentalEruptionScan.upload.hint')}
              </p>
              <Button
                onClick={() => void props.onPickImage()}
                tone="primary"
                size="md"
                className="mt-2"
              >
                {i18nText('DentalEruptionScan.action.pickPhoto')}
              </Button>
            </div>
          ) : null}

          {props.previewUrl ? (
            <div className="flex items-start gap-3">
              <img
                src={props.previewUrl}
                alt={i18nText('DentalEruptionScan.previewAlt')}
                className="h-28 w-28 rounded-2xl border border-[var(--nimi-border-subtle)] object-cover"
              />
              <div className="flex-1 text-[13px] text-[var(--nimi-text-muted)]">
                {props.stage === 'analyzing' ? (
                  <p>{i18nText('DentalEruptionScan.status.analyzing')}</p>
                ) : props.stage === 'saving' ? (
                  <p>{i18nText('DentalEruptionScan.status.savingRecord')}</p>
                ) : props.stage === 'review' ? (
                  <>
                    <p>
                      {i18nText('DentalEruptionScan.review.detectedSummary', { permanentCount, primaryCount })}
                    </p>
                    <p className="mt-1">{i18nText('DentalEruptionScan.review.confirmHint')}</p>
                  </>
                ) : (
                  <p>{i18nText('DentalEruptionScan.status.ready')}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={props.onRetake}
                    tone="secondary"
                    size="sm"
                  >
                    {i18nText('DentalEruptionScan.action.retake')}
                  </Button>
                  {props.stage === 'review' ? (
                    <Button
                      onClick={() => void props.onAnalyze()}
                      tone="secondary"
                      size="sm"
                    >
                      {i18nText('DentalEruptionScan.action.reanalyze')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {props.warnings.length > 0 && props.stage === 'review' ? (
            <div
              className="rounded-2xl border border-[color-mix(in_srgb,var(--nimi-status-warning)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] px-3 py-2 text-[13px] text-[var(--nimi-status-warning)]"
            >
              {props.warnings.map((warning, idx) => (
                <p key={idx}>· {warning}</p>
              ))}
            </div>
          ) : null}

          {props.stage === 'review' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-[var(--nimi-border-subtle)]">
                  {(['primary', 'permanent'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setToothSet(value)}
                      className={cn(
                        'px-3 py-1.5 text-[13px] transition-colors',
                        toothSet === value
                          ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
                          : 'bg-transparent text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]',
                      )}
                    >
                      {value === 'primary' ? i18nText('DentalEruptionScan.toothSet.primary') : i18nText('DentalEruptionScan.toothSet.permanent')}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => selectAllVisible(true)}
                    tone="secondary"
                    size="sm"
                  >
                    {i18nText('DentalEruptionScan.action.selectAllVisible')}
                  </Button>
                  <Button
                    onClick={() => selectAllVisible(false)}
                    tone="secondary"
                    size="sm"
                  >
                    {i18nText('DentalEruptionScan.action.deselectAllVisible')}
                  </Button>
                  <Button
                    onClick={handleFlip}
                    title={i18nText('DentalEruptionScan.action.flipHint')}
                    tone="secondary"
                    size="sm"
                  >
                    {i18nText('DentalEruptionScan.action.flip')}
                  </Button>
                  <Button
                    onClick={handleReset}
                    tone="secondary"
                    size="sm"
                  >
                    {i18nText('DentalEruptionScan.action.resetAiSelection')}
                  </Button>
                </div>
              </div>

              <Surface tone="panel" material="solid" elevation="base" padding="sm" className="rounded-2xl">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('DentalEruptionScan.arch.upper')}</p>
                  <div className="flex gap-1">
                    {renderToothRow(upperRight, i18nText('DentalEruptionScan.side.right'), candidateMap, selected, props.alreadyRecordedErupted, toggleTooth)}
                    <span className="w-3" />
                    {renderToothRow(upperLeft, '', candidateMap, selected, props.alreadyRecordedErupted, toggleTooth)}
                    <span className="ml-1 w-8 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('DentalEruptionScan.side.left')}</span>
                  </div>
                  <div className="my-1 h-px w-full bg-[var(--nimi-border-subtle)]" />
                  <div className="flex gap-1">
                    {renderToothRow(lowerRight, i18nText('DentalEruptionScan.side.right'), candidateMap, selected, props.alreadyRecordedErupted, toggleTooth)}
                    <span className="w-3" />
                    {renderToothRow(lowerLeft, '', candidateMap, selected, props.alreadyRecordedErupted, toggleTooth)}
                    <span className="ml-1 w-8 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('DentalEruptionScan.side.left')}</span>
                  </div>
                  <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('DentalEruptionScan.arch.lower')}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-[var(--nimi-text-muted)]">
                  <StatusBadge tone="info">{i18nText('DentalEruptionScan.legend.selected')}</StatusBadge>
                  <StatusBadge tone="warning">{i18nText('DentalEruptionScan.legend.deselected')}</StatusBadge>
                  <StatusBadge tone="neutral">{i18nText('DentalEruptionScan.legend.history')}</StatusBadge>
                  <StatusBadge tone="neutral" className="opacity-70">{i18nText('DentalEruptionScan.legend.notDetected')}</StatusBadge>
                </div>
              </Surface>

              <div>
                <p className="mb-1 text-[13px] text-[var(--nimi-text-muted)]">{i18nText('DentalEruptionScan.eventDate')}</p>
                <DatePicker value={props.eventDate} onChange={props.onEventDateChange} />
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--nimi-border-subtle)] px-5 py-3">
          <p className="text-[12px] text-[var(--nimi-text-muted)]">
            {i18nText('DentalEruptionScan.selectedSummary', { selectedCount: selected.size, permanentCount, primaryCount })}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={props.onClose}
              disabled={props.stage === 'analyzing' || props.stage === 'saving'}
              tone="secondary"
              size="md"
            >
              {i18nText('DentalEruptionScan.action.cancel')}
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={props.stage !== 'review' || selected.size === 0}
              tone="primary"
              size="md"
            >
              {props.stage === 'saving' ? i18nText('DentalEruptionScan.action.saving') : i18nText('DentalEruptionScan.action.confirm')}
            </Button>
          </div>
        </div>
    </OverlayShell>
  );
}

function findFlippedId(toothId: string): string | null {
  if (toothId.length !== 2) return null;
  const unit = toothId[1];
  const quadrant = toothId[0];
  const map: Record<string, string> = { '1': '2', '2': '1', '3': '4', '4': '3', '5': '6', '6': '5', '7': '8', '8': '7' };
  const flipped = map[quadrant ?? ''];
  if (!flipped) return null;
  return `${flipped}${unit}`;
}
