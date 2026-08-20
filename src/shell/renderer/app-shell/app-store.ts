import { create } from 'zustand';
import { i18nText } from '../i18n/index.js';
import type { ParentOSBootstrapFailure } from './bootstrap-failure.js';

export type NurtureMode = 'relaxed' | 'balanced' | 'advanced';

export interface ChildProfile {
  childId: string;
  familyId: string;
  displayName: string;
  gender: 'male' | 'female';
  birthDate: string;
  birthWeightKg: number | null;
  birthHeightCm: number | null;
  birthHeadCircCm: number | null;
  avatarPath: string | null;
  nurtureMode: NurtureMode;
  nurtureModeOverrides: Record<string, NurtureMode> | null;
  allergies: string[] | null;
  medicalNotes: string[] | null;
  recorderProfiles: Array<{ id: string; name: string }> | null;
  createdAt: string;
  updatedAt: string;
}

interface AppState {
  bootstrapReady: boolean;
  bootstrapError: string | null;
  bootstrapFailure: ParentOSBootstrapFailure | null;

  setBootstrapReady: (ready: boolean) => void;
  setBootstrapError: (error: string | null) => void;
  setBootstrapFailure: (failure: ParentOSBootstrapFailure | null) => void;
  clearLocalData: () => void;

  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;

  children: ChildProfile[];
  setChildren: (children: ChildProfile[]) => void;

  familyId: string | null;
  setFamilyId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  bootstrapReady: false,
  bootstrapError: null,
  bootstrapFailure: null,

  setBootstrapReady: (ready) => set({ bootstrapReady: ready }),
  setBootstrapError: (error) => set({ bootstrapError: error }),
  setBootstrapFailure: (failure) => set({ bootstrapFailure: failure }),
  clearLocalData: () => set({
    familyId: null,
    children: [],
    activeChildId: null,
  }),

  activeChildId: null,
  setActiveChildId: (id) => set({ activeChildId: id }),

  children: [],
  setChildren: (children) => set({ children }),

  familyId: null,
  setFamilyId: (id) => set({ familyId: id }),
}));

/** Compute age in months from birth date to now */
export function computeAgeMonths(birthDate: string): number {
  return computeAgeMonthsAt(birthDate, new Date().toISOString());
}

/** Compute age in months from birth date to an arbitrary ISO date/datetime */
export function computeAgeMonthsAt(birthDate: string, atDate: string): number {
  const birth = new Date(birthDate);
  const target = new Date(atDate);
  let months = (target.getFullYear() - birth.getFullYear()) * 12 + (target.getMonth() - birth.getMonth());
  if (target.getDate() < birth.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

/**
 * Format age in months for display:
 *   < 12 months: month-only label
 *   >= 12 months: year label, optionally with remaining months
 */
export function formatAge(months: number): string {
  if (months < 12) return i18nText('Common.age.months', { months });
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0
    ? i18nText('Common.age.yearsMonths', { years: y, months: m })
    : i18nText('Common.age.years', { years: y });
}
