import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, DatePicker, Surface, TextareaField } from '@nimiplatform/kit/ui';
import { saveAttachment, upsertMilestoneRecord } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { MILESTONE_CATALOG } from '../../knowledge-base/index.js';
import type { MilestoneDomain } from '../../knowledge-base/gen/milestone-catalog.gen.js';
import { PhotoGrid, type PendingPhoto } from './photo-grid.js';
import {
  ChipGroup,
  type ChipOption,
  FormField,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const DOMAINS: Array<{ key: MilestoneDomain; label: string; emoji: string }> = [
  { key: 'gross-motor', label: i18nText('Milestone.domain.grossMotor'), emoji: '🏃' },
  { key: 'fine-motor', label: i18nText('Milestone.domain.fineMotor'), emoji: '✋' },
  { key: 'language', label: i18nText('Milestone.domain.language'), emoji: '💬' },
  { key: 'cognitive', label: i18nText('Milestone.domain.cognitive'), emoji: '🧠' },
  { key: 'social-emotional', label: i18nText('Milestone.domain.socialEmotional'), emoji: '🤝' },
  { key: 'self-care', label: i18nText('Milestone.domain.selfCare'), emoji: '🪥' },
];

export function hasMilestoneCandidatesForAge(ageMonths: number): boolean {
  for (const milestone of MILESTONE_CATALOG) {
    const lowerBound = milestone.typicalAge.rangeStart - 12;
    const upperBound = milestone.typicalAge.rangeEnd + 6;
    if (ageMonths >= lowerBound && ageMonths <= upperBound) return true;
  }
  return false;
}

type MilestoneCaptureProps = {
  child: { childId: string };
  ageMonths: number;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  /** Optional trailing slot in the modal header (e.g., milestone/tanner tab switcher). */
  headerTrailing?: ReactNode;
};

export function MilestoneCaptureContent({ child, ageMonths, onSaved, onClose, headerTrailing }: MilestoneCaptureProps) {
  const isAgeRelevant = (milestone: typeof MILESTONE_CATALOG[number]) => {
    const lowerBound = milestone.typicalAge.rangeStart - 12;
    const upperBound = milestone.typicalAge.rangeEnd + 6;
    return ageMonths >= lowerBound && ageMonths <= upperBound;
  };

  const availableDomains = useMemo(() => {
    const seen = new Set<MilestoneDomain>();
    for (const milestone of MILESTONE_CATALOG) {
      if (isAgeRelevant(milestone)) seen.add(milestone.domain);
    }
    return DOMAINS.filter((option) => seen.has(option.key));
  }, [ageMonths]);

  const [domain, setDomain] = useState<MilestoneDomain>(() => availableDomains[0]?.key ?? 'gross-motor');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => {
    return MILESTONE_CATALOG.filter((milestone) => milestone.domain === domain && isAgeRelevant(milestone));
  }, [domain, ageMonths]);

  useEffect(() => {
    if (candidates.length === 1) {
      setSelectedId(candidates[0]!.milestoneId);
    }
  }, [candidates]);

  const milestone = candidates.find((item) => item.milestoneId === selectedId) ?? null;
  const showMilestoneList = candidates.length > 1;

  const handleSave = async () => {
    if (!milestone) return;
    setSaving(true);
    const now = isoNow();
    const recordId = ulid();
    try {
      await upsertMilestoneRecord({
        recordId,
        childId: child.childId,
        milestoneId: milestone.milestoneId,
        achievedAt: date ? new Date(date).toISOString() : now,
        ageMonthsWhenAchieved: ageMonths,
        notes: notes.trim() || null,
        photoPath: null,
        now,
      });
      for (const photo of photos) {
        await saveAttachment({
          attachmentId: ulid(),
          childId: child.childId,
          ownerTable: 'milestone_records',
          ownerId: recordId,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          imageBase64: photo.base64,
          caption: null,
          now,
        });
      }
      await onSaved();
      onClose();
    } catch {
      /* bridge unavailable */
    } finally {
      setSaving(false);
    }
  };

  if (availableDomains.length === 0) {
    return (
      <>
        <ModalHeader title={i18nText('Milestone.capture.title')} icon="🎯" onClose={onClose} trailing={headerTrailing} />
        <ModalContent>
          <div className="flex h-full flex-col items-center justify-center px-8 py-12 text-center">
            <div className="mb-3 text-[36px]">🎓</div>
            <p className="mb-1 text-[14px] font-medium text-[var(--nimi-text-primary)]">
              {i18nText('Milestone.capture.noCandidatesTitle')}
            </p>
            <p className="text-[13px] text-[var(--nimi-text-muted)]">
              {i18nText('Milestone.capture.noCandidatesHint')}
            </p>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Milestone.capture.close')}</Button>
        </ModalFooter>
      </>
    );
  }

  const domainChips: ChipOption<MilestoneDomain>[] = availableDomains.map((option) => ({
    value: option.key,
    label: option.label,
    emoji: option.emoji,
  }));

  return (
    <>
      <ModalHeader title={i18nText('Milestone.capture.title')} icon="🎯" onClose={onClose} trailing={headerTrailing} />
      <ModalContent>
        <div className="space-y-5">
          <FormField label={i18nText('Milestone.capture.domain')}>
            <ChipGroup
              options={domainChips}
              value={domain}
              onChange={(next) => {
                setDomain(next);
                setSelectedId(null);
              }}
            />
          </FormField>

          {showMilestoneList ? (
            <FormField label={i18nText('Milestone.capture.selectMilestone')}>
              <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {candidates.map((item) => (
                  <Surface
                    as="button"
                    key={item.milestoneId}
                    type="button"
                    onClick={() => setSelectedId(item.milestoneId)}
                    tone="card"
                    elevation="base"
                    padding="none"
                    material="solid"
                    interactive
                    active={selectedId === item.milestoneId}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">
                        {item.title}
                      </span>
                      <span className="text-[12px] text-[var(--nimi-text-muted)]">
                        {i18nText('Milestone.capture.ageRangeMonths', {
                          start: item.typicalAge.rangeStart,
                          end: item.typicalAge.rangeEnd,
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-[var(--nimi-text-muted)]">
                      {item.description}
                    </p>
                  </Surface>
                ))}
              </div>
            </FormField>
          ) : milestone ? (
            <Surface tone="card" elevation="base" padding="none" material="solid" active className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">
                  {milestone.title}
                </span>
                <span className="text-[12px] text-[var(--nimi-text-muted)]">
                  {i18nText('Milestone.capture.ageRangeMonths', {
                    start: milestone.typicalAge.rangeStart,
                    end: milestone.typicalAge.rangeEnd,
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--nimi-text-muted)]">
                {milestone.description}
              </p>
            </Surface>
          ) : null}

          {milestone ? (
            <>
              <FormField label={i18nText('Milestone.capture.achievedDate')}>
                <DatePicker value={date} onChange={setDate} className="h-12" />
              </FormField>

              <FormField label={i18nText('Milestone.capture.story')}>
                <TextareaField
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={i18nText('Milestone.capture.storyPlaceholder')}
                  rows={3}
                  className="w-full"
                />
              </FormField>

              <FormField label={i18nText('Milestone.capture.photos', { count: photos.length > 0 ? ` (${photos.length}/9)` : '' })}>
                <div className="space-y-2">
                  <PhotoGrid
                    photos={photos}
                    maxPhotos={9}
                    hint={i18nText('Milestone.capture.photoHint')}
                    onChange={setPhotos}
                  />
                </div>
              </FormField>
            </>
          ) : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Milestone.capture.cancel')}</Button>
        <Button type="button" onClick={() => void handleSave()} disabled={saving || !milestone} tone="primary" size="md">
          {saving ? i18nText('Milestone.capture.saving') : i18nText('Milestone.capture.save')}
        </Button>
      </ModalFooter>
    </>
  );
}
