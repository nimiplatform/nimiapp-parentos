// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellLayout } from './shell-layout.js';
import { useAppStore } from './app-store.js';
import { i18n } from '../i18n/index.js';

const { setAppSettingMock } = vi.hoisted(() => ({
  setAppSettingMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../bridge/sqlite-bridge.js', () => ({
  setAppSetting: setAppSettingMock,
}));

describe('ShellLayout', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    useAppStore.setState({
      bootstrapReady: true,
      familyId: 'family-1',
      activeChildId: 'child-1',
      children: [
        {
          childId: 'child-1',
          familyId: 'family-1',
          displayName: 'Mimi',
          gender: 'female',
          birthDate: '2024-01-15',
          birthWeightKg: null,
          birthHeightCm: null,
          birthHeadCircCm: null,
          avatarPath: null,
          nurtureMode: 'balanced',
          nurtureModeOverrides: null,
          allergies: null,
          medicalNotes: null,
          recorderProfiles: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          childId: 'child-2',
          familyId: 'family-1',
          displayName: 'Niko',
          gender: 'male',
          birthDate: '2022-06-10',
          birthWeightKg: null,
          birthHeightCm: null,
          birthHeadCircCm: null,
          avatarPath: null,
          nurtureMode: 'advanced',
          nurtureModeOverrides: null,
          allergies: null,
          medicalNotes: null,
          recorderProfiles: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      bootstrapReady: false,
      familyId: null,
      activeChildId: null,
      children: [],
    });
  });

  it('shows /reports in navigation and lets the active child switch in-place', async () => {
    const { container } = render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    expect(container.querySelector('a[href="/reports"]')).toBeTruthy();
    expect(screen.getByTestId('shell-main-drag-region')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '孩子与应用菜单' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Niko/i }));

    await waitFor(() => {
      expect(useAppStore.getState().activeChildId).toBe('child-2');
    });
  });

  it('keeps sidebar overflow layers above the main content region', () => {
    const { container } = render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    const shellRoot = container.firstElementChild;
    const nav = container.querySelector('nav');
    const main = container.querySelector('main');

    expect(shellRoot?.className).toContain('isolate');
    expect(nav?.className).toContain('relative');
    expect(nav?.className).toContain('z-30');
    expect(nav?.className).toContain('overflow-visible');
    expect(main?.className).toContain('z-0');
  });

  it('places the ParentOS logo at the top of the sidebar and the child/app menu at its bottom', () => {
    render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    const nav = document.querySelector('nav');
    const logo = screen.getByRole('img', { name: 'ParentOS 标志' });
    const menuButton = screen.getByRole('button', { name: '孩子与应用菜单' });

    expect(logo.getAttribute('src')).toContain('/src-tauri/icons/icon.png');
    expect(nav?.firstElementChild?.contains(logo)).toBe(true);
    expect(nav?.lastElementChild?.contains(menuButton)).toBe(true);
    expect(screen.queryByRole('heading', { name: 'ParentOS' })).toBeNull();
    expect(document.querySelector('header')).toBeNull();
  });

  it('hides shell navigation until a child profile is active', () => {
    useAppStore.setState({
      activeChildId: null,
      children: [],
    });

    const { container } = render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('a[href="/reports"]')).toBeNull();
    expect(screen.queryByRole('img', { name: 'ParentOS 标志' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'ParentOS' })).toBeNull();
    expect(screen.getByTestId('shell-main-drag-region')).toBeTruthy();
  });

  it('exposes profile and settings navigation without an app-owned account identity', async () => {
    render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '孩子与应用菜单' }));

    expect(await screen.findByRole('menuitem', { name: '档案' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '设置' })).toBeTruthy();
    expect(screen.queryByText('Parent User')).toBeNull();
  });
});
