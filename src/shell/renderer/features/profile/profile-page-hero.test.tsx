// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestNavigation, NavigationProbe } from '../../testing/navigation.js';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHero } from './profile-page-hero.js';

const child = {
  childId: 'child-1',
  displayName: '小米',
  birthDate: '2020-01-01',
  gender: 'female' as const,
  avatarPath: null,
};

describe('ProfileHero', () => {
  it('renders add health data as a soft primary action', () => {
    const onAddRecord = vi.fn();
    render(
      <TestNavigation>
        <ProfileHero
          child={child}
          ageMonths={72}
          completeness={80}
          recordCount={3}
          lastRecordedDaysAgo={2}
          onAddRecord={onAddRecord}
        />
      </TestNavigation>,
    );

    const addButton = screen.getByRole('button', { name: /添加健康数据/ });
    expect(addButton.classList.contains('bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_20%,var(--nimi-surface-card))]')).toBe(true);
    expect(addButton.classList.contains('text-[var(--nimi-text-primary)]')).toBe(true);
    expect(addButton.classList.contains('bg-[var(--nimi-action-primary-bg)]')).toBe(false);

    fireEvent.click(addButton);
    expect(onAddRecord).toHaveBeenCalledOnce();
  });

  it('renders edit action with icon without violating single-child slot constraints', async () => {
    render(
      <TestNavigation initial={{ id: '/profile' }}>
        <ProfileHero child={child} ageMonths={72} completeness={80} recordCount={3} lastRecordedDaysAgo={2} onAddRecord={vi.fn()} /><NavigationProbe />
      </TestNavigation>,
    );

    fireEvent.click(screen.getByRole('button', { name: /编辑资料/ }));

    await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('/settings/children'));
  });
});
