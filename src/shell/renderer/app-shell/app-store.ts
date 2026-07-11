import { create } from 'zustand';
import type { NimiAIConfig } from '@nimiplatform/sdk/ai';
import { i18nText } from '../i18n/index.js';
import type { ParentOSProtectedSessionFailure } from './protected-session-state.js';

type RuntimeDefaults = {
  readonly webBaseUrl: string;
};

export type NurtureMode = 'relaxed' | 'balanced' | 'advanced';

export type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
};

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

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
  // PO-SHELL-008 / spec K-ACCSVC-008: ParentOS does not own access or refresh
  // tokens. The `auth` slice tracks only the runtime-projected account
  // identity. Non-first-party local app auth uses Runtime app sessions and
  // scoped/protected metadata, not raw Realm access-token projection.
  auth: {
    status: AuthStatus;
    user: AuthUser | null;
  };
  bootstrapReady: boolean;
  bootstrapError: string | null;
  bootstrapFailure: ParentOSProtectedSessionFailure | null;
  runtimeDefaults: RuntimeDefaults | null;

  setAuthSession: (user: AuthUser) => void;
  clearAuthSession: () => void;
  setBootstrapReady: (ready: boolean) => void;
  setBootstrapError: (error: string | null) => void;
  setBootstrapFailure: (failure: ParentOSProtectedSessionFailure | null) => void;
  setRuntimeDefaults: (defaults: RuntimeDefaults) => void;
  clearLocalData: () => void;

  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;

  children: ChildProfile[];
  setChildren: (children: ChildProfile[]) => void;

  familyId: string | null;
  setFamilyId: (id: string | null) => void;

  aiConfig: NimiAIConfig | null;
  setAIConfig: (config: NimiAIConfig) => void;
}

export const useAppStore = create<AppState>((set) => ({
  auth: {
    status: 'bootstrapping',
    user: null,
  },
  bootstrapReady: false,
  bootstrapError: null,
  bootstrapFailure: null,
  runtimeDefaults: null,

  setAuthSession(user) {
    set({
      auth: { status: 'authenticated', user },
    });
  },
  clearAuthSession() {
    set({
      auth: { status: 'unauthenticated', user: null },
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });
  },
  setBootstrapReady: (ready) => set({ bootstrapReady: ready }),
  setBootstrapError: (error) => set({ bootstrapError: error }),
  setBootstrapFailure: (failure) => set({ bootstrapFailure: failure }),
  setRuntimeDefaults: (defaults) => set({ runtimeDefaults: defaults }),
  clearLocalData: () => set({
    familyId: null,
    children: [],
    activeChildId: null,
    aiConfig: null,
  }),

  activeChildId: null,
  setActiveChildId: (id) => set({ activeChildId: id }),

  children: [],
  setChildren: (children) => set({ children }),

  familyId: null,
  setFamilyId: (id) => set({ familyId: id }),

  aiConfig: null,
  setAIConfig: (config) => set({ aiConfig: config }),
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
