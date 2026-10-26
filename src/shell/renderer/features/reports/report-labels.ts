import { i18nText } from '../../i18n/index.js';

// @nimi-authority: rule.parentos.advs.r007
export function reportMeasurementUnit(unit: string | undefined): string {
  // Decimal visual acuity is a notation, not a physical unit.
  if (!unit || unit === 'decimal') return '';
  if (unit === 'years') return i18nText('Reports.units.years');
  return unit;
}
