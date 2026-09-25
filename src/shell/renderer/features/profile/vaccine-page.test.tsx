// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import type { VaccineRecordRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';
import VaccinePage from './vaccine-page.js';

const { bridge, requestSync } = vi.hoisted(() => ({
  bridge: {
    getVaccineRecords: vi.fn(),
    insertVaccineRecord: vi.fn(),
    updateVaccineRecord: vi.fn(),
    deleteVaccineRecord: vi.fn(),
  },
  requestSync: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => bridge);
vi.mock('../reminders/reminder-activity.js', () => ({ requestReminderActivitySync: requestSync }));
vi.mock('./ai-summary-card.js', () => ({ AISummaryCard: () => null }));

Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
Object.defineProperty(Element.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });

const child: ChildProfile = {
  childId: '01K0CHILD00000000000000000', familyId: 'family-1', displayName: 'Mia',
  gender: 'female', birthDate: '2025-03-01', birthWeightKg: null, birthHeightCm: null,
  birthHeadCircCm: null, avatarPath: null, nurtureMode: 'balanced', nurtureModeOverrides: null,
  allergies: null, medicalNotes: null, recorderProfiles: null,
  createdAt: '2025-04-01T00:00:00.000Z', updatedAt: '2025-04-01T00:00:00.000Z',
};
const rule = REMINDER_RULES.find((item) => item.ruleId === 'PO-REM-VAC-001')!;
const record: VaccineRecordRow = {
  recordId: '01K0VACCINE000000000000000', childId: child.childId, ruleId: rule.ruleId,
  vaccineName: rule.title, vaccinatedAt: '2025-03-01', ageMonths: 0,
  batchNumber: null, hospital: null, adverseReaction: null, photoPath: null,
  createdAt: '2025-03-01T06:00:00.000Z',
};

function pendingWrite() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function renderPage(search = '') {
  return render(<MemoryRouter initialEntries={[`/profile/vaccines${search}`]}><VaccinePage /></MemoryRouter>);
}

async function submitRecord(entry: 'catalog' | 'capture') {
  renderPage(entry === 'catalog' ? `?ruleId=${rule.ruleId}` : '');
  if (entry === 'capture') {
    fireEvent.click(screen.getByRole('button', { name: i18nText('Vaccine.page.addRecord') }));
    fireEvent.pointerDown(screen.getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.keyDown(await screen.findByRole('option', { name: rule.title }), { key: 'Enter' });
  }
  const saveLabel = i18nText(entry === 'catalog' ? 'Vaccine.recordModal.save' : 'Vaccine.capture.save');
  fireEvent.click(await screen.findByRole('button', { name: saveLabel }));
  await waitFor(() => expect(bridge.insertVaccineRecord).toHaveBeenCalledWith(expect.objectContaining({
    childId: child.childId, ruleId: rule.ruleId,
  })));
}

async function deleteRecord() {
  bridge.getVaccineRecords.mockResolvedValueOnce([record]).mockResolvedValue([]);
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: i18nText('Vaccine.page.delete') }));
  fireEvent.click(screen.getByRole('button', { name: i18nText('Vaccine.page.deleteConfirm') }));
  expect(bridge.deleteVaccineRecord).toHaveBeenCalledWith(record.recordId, expect.any(String));
}

describe('vaccine reminder activity after persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T04:00:00.000Z'));
    vi.resetAllMocks();
    bridge.getVaccineRecords.mockResolvedValue([]);
    useAppStore.setState({ bootstrapReady: true, familyId: child.familyId, activeChildId: child.childId, children: [child] });
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ bootstrapReady: false, familyId: null, activeChildId: null, children: [] });
    vi.useRealTimers();
  });

  it.each(['catalog', 'capture'] as const)('requests sync only after the %s insertion commits', async (entry) => {
    const write = pendingWrite();
    bridge.insertVaccineRecord.mockReturnValue(write.promise);
    await submitRecord(entry);
    expect(requestSync).not.toHaveBeenCalled();
    await act(async () => write.resolve());
    expect(requestSync).toHaveBeenCalledExactlyOnceWith(child.childId);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['catalog', 'capture'] as const)('keeps a failed %s insertion visible without requesting sync', async (entry) => {
    const write = pendingWrite();
    bridge.insertVaccineRecord.mockReturnValue(write.promise);
    await submitRecord(entry);
    await act(async () => write.reject(new Error('vaccine transaction failed')));
    expect(requestSync).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(entry === 'catalog' ? i18nText('Vaccine.error.saveFailed') : 'vaccine transaction failed')).toBeTruthy();
  });

  it('requests sync only after deletion has restored the persisted reminder', async () => {
    const write = pendingWrite();
    bridge.deleteVaccineRecord.mockReturnValue(write.promise);
    await deleteRecord();
    expect(requestSync).not.toHaveBeenCalled();
    await act(async () => write.resolve());
    expect(requestSync).toHaveBeenCalledExactlyOnceWith(child.childId);
  });

  it('keeps a failed deletion visible without requesting sync', async () => {
    const write = pendingWrite();
    bridge.deleteVaccineRecord.mockReturnValue(write.promise);
    await deleteRecord();
    await act(async () => write.reject(new Error('vaccine transaction failed')));
    expect(requestSync).not.toHaveBeenCalled();
    expect(screen.getByText(i18nText('Vaccine.error.deleteFailed'))).toBeTruthy();
  });
});
