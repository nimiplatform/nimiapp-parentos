import {
  createParentosAISurfaceUnavailableError,
} from '../settings/parentos-ai-runtime.js';
import { isParentosAISurfaceExecutable } from '../settings/parentos-ai-surface-policy.js';
import { i18nText } from '../../i18n/index.js';

export type DentalToothType = 'primary' | 'permanent';

export interface DentalEruptionCandidate {
  toothId: string;
  type: DentalToothType;
  confidence: number;
}

export interface DentalEruptionExtraction {
  candidates: DentalEruptionCandidate[];
  warnings: string[];
}

type DentalScanErrorCode = 'surface-unavailable' | 'failed';

class DentalScanError extends Error {
  constructor(readonly scanCode: DentalScanErrorCode, message: string) {
    super(message);
    this.name = 'DentalScanError';
  }
}

function dentalScanError(code: DentalScanErrorCode): DentalScanError {
  switch (code) {
    case 'surface-unavailable':
      return new DentalScanError(code, i18nText('DentalEruptionScan.error.surfaceUnavailable'));
    case 'failed':
      return new DentalScanError(code, i18nText('DentalEruptionScan.error.failed'));
  }
}

function isSurfaceNotAdmittedError(error: unknown): boolean {
  return (error as { reasonCode?: unknown } | null)?.reasonCode === 'parentos-ai-surface-not-admitted';
}

export function normalizeDentalScanError(error: unknown): Error {
  if (isSurfaceNotAdmittedError(error)) {
    return dentalScanError('surface-unavailable');
  }
  if (error instanceof Error) {
    return error;
  }
  return dentalScanError('failed');
}

export function getDentalScanDisplayMessage(error: unknown): string {
  return normalizeDentalScanError(error).message;
}

export async function hasDentalScanRuntime() {
  // Vision/OCR has no admitted Nimi App Access operation; the entry stays
  // visible but gated off with manual selection as the offered path.
  return isParentosAISurfaceExecutable('parentos.profile.dental-eruption-scan');
}

export async function analyzeDentalEruptionImage(input: {
  imageUrl: string;
  ageMonths: number;
}): Promise<DentalEruptionExtraction> {
  const imageUrl = input.imageUrl.trim();
  if (!imageUrl) {
    throw new Error('dental scan requires an imageUrl');
  }
  throw createParentosAISurfaceUnavailableError('parentos.profile.dental-eruption-scan');
}

const QUADRANT_FLIP: Record<string, string> = {};
for (let unit = 1; unit <= 8; unit++) {
  const u = String(unit);
  QUADRANT_FLIP[`1${u}`] = `2${u}`;
  QUADRANT_FLIP[`2${u}`] = `1${u}`;
  QUADRANT_FLIP[`3${u}`] = `4${u}`;
  QUADRANT_FLIP[`4${u}`] = `3${u}`;
  if (unit <= 5) {
    QUADRANT_FLIP[`5${u}`] = `6${u}`;
    QUADRANT_FLIP[`6${u}`] = `5${u}`;
    QUADRANT_FLIP[`7${u}`] = `8${u}`;
    QUADRANT_FLIP[`8${u}`] = `7${u}`;
  }
}

export function flipCandidatesHorizontally(candidates: DentalEruptionCandidate[]): DentalEruptionCandidate[] {
  return candidates.map((candidate) => {
    const mirrored = QUADRANT_FLIP[candidate.toothId];
    if (!mirrored) return candidate;
    return { ...candidate, toothId: mirrored };
  });
}
