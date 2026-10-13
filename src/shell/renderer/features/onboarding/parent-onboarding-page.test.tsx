// @vitest-environment jsdom

import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { TestNavigation } from '../../testing/navigation.js';
import { useParentOSPosition, useParentOSIntent } from '../../app-shell/app-navigation.js';
import { describe, expect, it } from 'vitest';
import { ParentOnboardingPage } from './parent-onboarding-page.js';

function ChildrenSettingsProbe() { const position = useParentOSPosition(), intent = useParentOSIntent(); return <div data-testid="children-settings-probe">{JSON.stringify({position,intent})}</div>; }

function renderPage() {
  return render(
    <TestNavigation><ParentOnboardingPage /><ChildrenSettingsProbe /></TestNavigation>,
  );
}

describe('ParentOnboardingPage', () => {
  it('renders the intro copy and the create-child call to action', () => {
    renderPage();

    expect(screen.getByTestId('parentos-onboarding-page')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /科学陪伴每一步/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /孩子全周期成长助手/ })).toBeTruthy();
    expect(screen.getByText('ParentOS 基于循证成长知识库，覆盖从婴幼儿到青春期的每一个阶段，让育儿更安心、更有方向。')).toBeTruthy();
    const featureList = screen.getByRole('list', { name: 'ParentOS 核心能力' });
    for (const label of ['主动提醒', '循证支持', '成长记录', '个性化定制']) {
      expect(within(featureList).getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '建立宝贝档案' })).toBeTruthy();
  });

  it('renders growth-focus tags around the journey visual', () => {
    renderPage();

    const journey = screen.getByTestId('parentos-onboarding-growth-journey');
    expect(journey.getAttribute('src')).toContain('growth-journey.webp');

    for (const label of ['疫苗接种', '定期体检', '发育里程碑', '敏感期提示', '成长记录']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('connects the call to action to the existing create-child flow', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '建立宝贝档案' }));

    const probe = screen.getByTestId('children-settings-probe');
    await waitFor(() => expect(probe.textContent).toContain('add-child'));
  });
});
