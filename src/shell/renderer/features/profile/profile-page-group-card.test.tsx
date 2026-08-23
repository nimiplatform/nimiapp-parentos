// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { HealthMetricSnapshot } from '../../engine/health-record-domain.js';
import {
  HEALTH_METRIC_GROUPS,
  HEALTH_METRICS,
  type HealthMetricGroupId,
  type HealthMetricId,
} from '../../knowledge-base/index.js';
import { ProfileGroupCard } from './profile-page-group-card.js';

function requireGroup(groupId: HealthMetricGroupId) {
  const group = HEALTH_METRIC_GROUPS.find((candidate) => candidate.groupId === groupId);
  if (!group) throw new Error(`Missing test group: ${groupId}`);
  return group;
}

function makeSnapshot(metricId: HealthMetricId, recorded: boolean): HealthMetricSnapshot {
  const metric = HEALTH_METRICS.find((candidate) => candidate.metricId === metricId);
  if (!metric) throw new Error(`Missing test metric: ${metricId}`);

  return {
    metric,
    latestValue: recorded
      ? {
          valueId: `value-${metricId}`,
          eventId: `event-${metricId}`,
          childId: 'child-1',
          metricId,
          valueNumber: 1,
          unit: metric.unit ?? null,
          recordKind: 'measured',
          createdAt: '2026-08-22T00:00:00.000Z',
        }
      : null,
    latestEvent: recorded
      ? {
          eventId: `event-${metricId}`,
          childId: 'child-1',
          protocolId: metric.captureProtocolIds[0] ?? 'fitness-school-assessment',
          groupId: metric.groupId,
          recordKind: 'manual',
          sourceSurface: 'profile_console',
          recordedAt: '2026-08-22T00:00:00.000Z',
          effectiveDate: '2026-08-22',
          ageMonths: 120,
          createdAt: '2026-08-22T00:00:00.000Z',
          updatedAt: '2026-08-22T00:00:00.000Z',
        }
      : null,
    nextRecordAt: null,
    freshness: recorded ? 'fresh' : 'missing',
    evaluation: {
      status: recorded ? 'unrated' : 'missing',
      colorAlias: 'neutral',
      statusReasonCode: recorded ? 'not-evaluated' : 'missing',
      shortLabel: recorded ? 'Recorded' : 'Missing',
      explanation: '',
      sourceRefs: [],
      computedAt: '2026-08-22T00:00:00.000Z',
      inputs: {},
      safetyBoundary: 'not_evaluated',
    },
  };
}

describe('ProfileGroupCard category action buttons', () => {
  it('renders record, update, and sport activity actions with the light primary treatment', () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileGroupCard
          group={{
            group: requireGroup('fitness'),
            metrics: [
              makeSnapshot('fitness.run_50m', false),
              makeSnapshot('fitness.vital_capacity', true),
              makeSnapshot('fitness.activity_category', false),
            ],
          }}
          onCapture={() => undefined}
        />
      </MemoryRouter>,
    );

    const expandButton = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    expect(expandButton).not.toBeNull();
    fireEvent.click(expandButton!);

    const actionButtons = Array.from(container.querySelectorAll('button, span')).filter(
      (element) =>
        element.classList.contains('rounded-full') &&
        element.classList.contains('text-[var(--nimi-action-primary-bg)]'),
    );
    expect(actionButtons).toHaveLength(3);
    actionButtons.forEach((button) => {
      expect(button.classList.contains('text-[var(--nimi-action-primary-bg)]')).toBe(true);
      expect(button.classList.contains('border')).toBe(true);
      expect(button.classList.contains('bg-black')).toBe(false);
    });
  });
});
