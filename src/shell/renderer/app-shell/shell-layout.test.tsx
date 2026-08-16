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
      auth: {
        status: 'authenticated',
        user: {
          id: 'user-1',
          displayName: 'Parent User',
          email: 'parent@example.com',
        },
      },
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
      auth: { status: 'unauthenticated', user: null },
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

    fireEvent.click(screen.getByRole('button', { name: '切换孩子' }));
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

  it('places the ParentOS logo before the topbar title', () => {
    render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    const logo = screen.getByRole('img', { name: 'ParentOS 标志' });
    const title = screen.getByRole('heading', { name: 'ParentOS' });

    expect(logo.getAttribute('src')).toContain('/src-tauri/icons/icon.png');
    expect(title.parentElement?.firstElementChild).toBe(logo);
    expect(title.closest('header')?.className).toContain('pl-2');
    expect(title.closest('header')?.className).toContain('pr-6');
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

  it('does not expose logout from the account avatar menu', async () => {
    render(
      <MemoryRouter>
        <ShellLayout>
          <div>APP_CONTENT</div>
        </ShellLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开账号菜单' }));

    expect(await screen.findByText('Parent User')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull();
    expect(screen.queryByText(/退出登录/)).toBeNull();
  });
});
