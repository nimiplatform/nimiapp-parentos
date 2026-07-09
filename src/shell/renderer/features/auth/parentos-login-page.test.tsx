// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../i18n/index.js', () => ({
  i18nText: (key: string) => key,
}));

vi.mock('./nimi-login-background.js', () => ({
  NimiLoginBackground: () => <div data-testid="parentos-login-background" />,
}));

vi.mock('../../../../../src-tauri/icons/icon.png', () => ({
  default: '/src-tauri/icons/icon.png',
}));

import { ParentOSLaunchPage, ParentOSLoginPage } from './parentos-login-page.js';

describe('ParentOS installed app launch page', () => {
  it('renders the installed app launch page without ShellAuthPage wiring', () => {
    render(<ParentOSLoginPage />);

    expect(screen.getByTestId('parentos-launch-page')).toBeTruthy();
    expect(screen.getByTestId('parentos-launch-trigger')).toBeTruthy();
    expect(screen.getByAltText('App.logoAlt').getAttribute('src')).toBe('/src-tauri/icons/icon.png');
  });

  it('calls onEnter from the launch trigger', () => {
    const onEnter = vi.fn();
    render(<ParentOSLaunchPage onEnter={onEnter} />);

    fireEvent.click(screen.getByTestId('parentos-launch-trigger'));

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('source does not import desktop auth or OAuth broker surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'parentos-login-page.tsx'), 'utf8');

    expect(source).not.toMatch(/ShellAuthPage|DesktopShellAuthPage/);
    expect(source).not.toMatch(/desktopBrowserAuth|runtimeAccountBroker|oauth/i);
    expect(source).not.toMatch(/createParentOSRuntimeAccountBrowserBroker/);
  });
});
