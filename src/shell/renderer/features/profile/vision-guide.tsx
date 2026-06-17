import { Button, IconButton, Surface } from '@nimiplatform/kit/ui';
import { useState } from 'react';
import { i18nText } from '../../i18n/index.js';


/* ================================================================
   VISION GUIDE — interactive step-by-step tutorial
   ================================================================ */

const BODY_KEY = 'bodyKey';
const ITEMS_KEY = 'items';
const TABLE_KEY = 'table';
const EXAMPLES_KEY = 'examples';

const GUIDE_STEPS = [
  {
    titleKey: 'Vision.guide.steps.refraction.title',
    sections: [
      {
        headingKey: 'Vision.guide.steps.refraction.what.heading',
        bodyKey: 'Vision.guide.steps.refraction.what.body',
      },
      {
        headingKey: 'Vision.guide.steps.refraction.pupil.heading',
        items: [
          {
            labelKey: 'Vision.guide.steps.refraction.pupil.small.label',
            descKey: 'Vision.guide.steps.refraction.pupil.small.desc',
            tagKey: 'Vision.guide.steps.refraction.pupil.small.tag',
          },
          {
            labelKey: 'Vision.guide.steps.refraction.pupil.cycloplegic.label',
            descKey: 'Vision.guide.steps.refraction.pupil.cycloplegic.desc',
            tagKey: 'Vision.guide.steps.refraction.pupil.cycloplegic.tag',
          },
        ],
      },
      {
        headingKey: 'Vision.guide.steps.refraction.method.heading',
        items: [
          {
            labelKey: 'Vision.guide.steps.refraction.method.computer.label',
            descKey: 'Vision.guide.steps.refraction.method.computer.desc',
            tagKey: 'Vision.guide.steps.refraction.method.computer.tag',
          },
          {
            labelKey: 'Vision.guide.steps.refraction.method.subjective.label',
            descKey: 'Vision.guide.steps.refraction.method.subjective.desc',
            tagKey: 'Vision.guide.steps.refraction.method.subjective.tag',
          },
        ],
      },
    ],
  },
  {
    titleKey: 'Vision.guide.steps.prescription.title',
    sections: [
      {
        headingKey: 'Vision.guide.steps.prescription.fields.heading',
        table: [
          {
            fieldKey: 'Vision.guide.steps.prescription.fields.sph.field',
            meaningKey: 'Vision.guide.steps.prescription.fields.sph.meaning',
            noteKey: 'Vision.guide.steps.prescription.fields.sph.note',
          },
          {
            fieldKey: 'Vision.guide.steps.prescription.fields.cyl.field',
            meaningKey: 'Vision.guide.steps.prescription.fields.cyl.meaning',
            noteKey: 'Vision.guide.steps.prescription.fields.cyl.note',
          },
          {
            fieldKey: 'Vision.guide.steps.prescription.fields.axis.field',
            meaningKey: 'Vision.guide.steps.prescription.fields.axis.meaning',
            noteKey: 'Vision.guide.steps.prescription.fields.axis.note',
          },
          {
            fieldKey: 'Vision.guide.steps.prescription.fields.va.field',
            meaningKey: 'Vision.guide.steps.prescription.fields.va.meaning',
            noteKey: 'Vision.guide.steps.prescription.fields.va.note',
          },
          {
            fieldKey: 'Vision.guide.steps.prescription.fields.pd.field',
            meaningKey: 'Vision.guide.steps.prescription.fields.pd.meaning',
            noteKey: 'Vision.guide.steps.prescription.fields.pd.note',
          },
        ],
      },
      {
        headingKey: 'Vision.guide.steps.prescription.eyeNames.heading',
        bodyKey: 'Vision.guide.steps.prescription.eyeNames.body',
      },
      {
        headingKey: 'Vision.guide.steps.prescription.examples.heading',
        examples: [
          {
            raw: 'OD  -1.25DS / -0.75DC x 80 -> 1.0',
            parsedKey: 'Vision.guide.steps.prescription.examples.odFull',
          },
          {
            raw: 'R  -1.25 / -0.75 x 80',
            parsedKey: 'Vision.guide.steps.prescription.examples.shortNotation',
          },
          {
            raw: 'R  PL -> 1.0',
            parsedKey: 'Vision.guide.steps.prescription.examples.plano',
          },
          {
            raw: 'R  0.6  -1.25DS / -0.75DC x 80 -> 1.0',
            parsedKey: 'Vision.guide.steps.prescription.examples.uncorrectedPrefix',
          },
        ],
      },
    ],
  },
  {
    titleKey: 'Vision.guide.steps.axial.title',
    sections: [
      {
        headingKey: 'Vision.guide.steps.axial.what.heading',
        bodyKey: 'Vision.guide.steps.axial.what.body',
      },
      {
        headingKey: 'Vision.guide.steps.axial.fields.heading',
        table: [
          {
            fieldKey: 'Vision.guide.steps.axial.fields.al.field',
            meaningKey: 'Vision.guide.steps.axial.fields.al.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.al.note',
          },
          {
            fieldKey: 'Vision.guide.steps.axial.fields.k1.field',
            meaningKey: 'Vision.guide.steps.axial.fields.k1.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.k1.note',
          },
          {
            fieldKey: 'Vision.guide.steps.axial.fields.k2.field',
            meaningKey: 'Vision.guide.steps.axial.fields.k2.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.k2.note',
          },
          {
            fieldKey: 'Vision.guide.steps.axial.fields.acd.field',
            meaningKey: 'Vision.guide.steps.axial.fields.acd.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.acd.note',
          },
          {
            fieldKey: 'Vision.guide.steps.axial.fields.lt.field',
            meaningKey: 'Vision.guide.steps.axial.fields.lt.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.lt.note',
          },
          {
            fieldKey: 'Vision.guide.steps.axial.fields.alcr.field',
            meaningKey: 'Vision.guide.steps.axial.fields.alcr.meaning',
            noteKey: 'Vision.guide.steps.axial.fields.alcr.note',
          },
        ],
      },
      {
        headingKey: 'Vision.guide.steps.axial.reserve.heading',
        bodyKey: 'Vision.guide.steps.axial.reserve.body',
      },
    ],
  },
];

export function VisionGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = GUIDE_STEPS[step];
  if (!current) return null;

  return (
    <Surface tone="card" elevation="raised" padding="none" className="mb-5 overflow-hidden rounded-3xl">
      {/* Step header */}
      <div className="bg-[image:var(--nimi-surface-hero)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] text-white/60">{i18nText('Vision.guide.stepLabel')}</span>
          <IconButton
            aria-label={i18nText('Vision.guide.closeAria')}
            icon="✕"
            onClick={onClose}
            size="sm"
            tone="ghost"
            className="h-6 min-h-6 w-6 border-transparent text-white/60 hover:bg-white/10 hover:text-white"
          />
        </div>
        <h3 className="text-[16px] font-bold text-white mb-3">{i18nText(current.titleKey)}</h3>
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
            <h4 className="text-[14px] font-semibold mb-2 text-[var(--nimi-text-primary)]">{i18nText(sec.headingKey)}</h4>

            {BODY_KEY in sec && sec.bodyKey && (
              <p className="text-[14px] leading-relaxed text-[var(--nimi-text-muted)]">{i18nText(sec.bodyKey)}</p>
            )}

            {ITEMS_KEY in sec && sec.items && (
              <div className="space-y-2">
                {sec.items.map((item, ii) => (
                  <div key={ii} className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText(item.labelKey)}</span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)] px-1.5 py-0.5 text-[12px] text-[var(--nimi-action-primary-bg)]">{i18nText(item.tagKey)}</span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{i18nText(item.descKey)}</p>
                  </div>
                ))}
              </div>
            )}

            {TABLE_KEY in sec && sec.table && (
              <div className="overflow-hidden rounded-2xl border border-[var(--nimi-border-subtle)]">
                <div className="grid grid-cols-[1.2fr_1fr_1.5fr] bg-[var(--nimi-surface-panel)] px-3 py-2 text-[12px] font-medium text-[var(--nimi-text-muted)]">
                  <span>{i18nText('Vision.guide.table.field')}</span><span>{i18nText('Vision.guide.table.meaning')}</span><span>{i18nText('Vision.guide.table.note')}</span>
                </div>
                {sec.table.map((row, ri) => (
                  <div
                    key={ri}
                    className={`grid grid-cols-[1.2fr_1fr_1.5fr] border-t border-[var(--nimi-border-subtle)] px-3 py-2 text-[13px] ${ri % 2 === 0 ? 'bg-[var(--nimi-surface-card)]' : 'bg-[var(--nimi-surface-panel)]'}`}
                  >
                    <span className="font-semibold text-[var(--nimi-action-primary-bg)]">{i18nText(row.fieldKey)}</span>
                    <span className="text-[var(--nimi-text-primary)]">{i18nText(row.meaningKey)}</span>
                    <span className="text-[var(--nimi-text-muted)]">{i18nText(row.noteKey)}</span>
                  </div>
                ))}
              </div>
            )}

            {EXAMPLES_KEY in sec && sec.examples && (
              <div className="space-y-2">
                {sec.examples.map((ex, ei) => (
                  <div key={ei} className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
                    <p className="text-[14px] font-mono font-semibold mb-1 text-[var(--nimi-text-primary)]">{ex.raw}</p>
                    <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText(ex.parsedKey)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-5 py-3">
        <Button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} tone="ghost" size="sm" className="disabled:opacity-30">
          {i18nText('Vision.guide.navigation.previous')}
        </Button>
        {step < GUIDE_STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} tone="primary" size="sm" className="rounded-2xl">
            {i18nText('Vision.guide.navigation.next')}
          </Button>
        ) : (
          <Button onClick={onClose} tone="primary" size="sm" className="rounded-2xl">
            {i18nText('Vision.guide.navigation.done')}
          </Button>
        )}
      </div>
    </Surface>
  );
}
