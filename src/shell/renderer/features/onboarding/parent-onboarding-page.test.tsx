// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ParentOnboardingPage } from './parent-onboarding-page.js';

function ChildrenSettingsProbe() {
  const location = useLocation();
  return <div data-testid="children-settings-probe">{JSON.stringify(location.state)}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ParentOnboardingPage />} />
        <Route path="/settings/children" element={<ChildrenSettingsProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ParentOnboardingPage', () => {
  it('renders the intro copy and the create-child call to action', () => {
    renderPage();

    expect(screen.getByTestId('parentos-onboarding-page')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /科学陪伴每一步/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /成长更有方向/ })).toBeTruthy();
    expect(screen.getByText('疫苗、体检、里程碑、敏感期——按孩子的年龄与阶段，主动提醒当下最值得关注的事。')).toBeTruthy();
    expect(screen.getByText('从出生到青春期，为孩子的成长留一份看得懂的底稿。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '建立宝贝档案' })).toBeTruthy();
  });

  it('renders growth-focus tags around the journey visual', () => {
    renderPage();

    for (const label of ['疫苗接种', '定期体检', '发育里程碑', '敏感期提示', '成长记录']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('connects the call to action to the existing create-child flow', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '建立宝贝档案' }));

    const probe = screen.getByTestId('children-settings-probe');
    expect(probe.textContent).toContain('add-child');
  });
});
