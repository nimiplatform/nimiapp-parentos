// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18nText } from '../../i18n/index.js';
import { ObservationFocusPanel, type ObservationFocusData } from './journal-observation-focus.js';

function buildFocus(overrides: Partial<ObservationFocusData> = {}): ObservationFocusData {
  return {
    dimensionId: 'dim-a',
    displayName: 'Dimension A',
    parentQuestion: 'Parent question?',
    observableSignals: [],
    guidedQuestions: [],
    experiment: null,
    ...overrides,
  };
}

const manySignals = Array.from({ length: 15 }, (_, i) => `Signal ${i + 1}`);
const manyQuestions = Array.from({ length: 6 }, (_, i) => `Question ${i + 1}?`);

describe('ObservationFocusPanel progressive disclosure', () => {
  it('shows all signals without a toggle when the list is short', () => {
    render(
      <ObservationFocusPanel
        focus={buildFocus({ observableSignals: ['One', 'Two', 'Three', 'Four', 'Five'] })}
        options={[]}
        onSwitchDimension={() => {}}
      />,
    );
    expect(screen.getByText('Five')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /\+\d+/ })).toBeNull();
  });

  it('collapses long signal lists behind a toggle and expands on click', () => {
    render(
      <ObservationFocusPanel
        focus={buildFocus({ observableSignals: manySignals })}
        options={[]}
        onSwitchDimension={() => {}}
      />,
    );
    expect(screen.getByText('Signal 4')).toBeTruthy();
    expect(screen.queryByText('Signal 5')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: i18nText('Journal.focus.signalsMore', { count: 11 }) }));
    expect(screen.getByText('Signal 15')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: i18nText('Journal.focus.showLess') }));
    expect(screen.queryByText('Signal 5')).toBeNull();
  });

  it('collapses long guided question lists behind a toggle', () => {
    render(
      <ObservationFocusPanel
        focus={buildFocus({ guidedQuestions: manyQuestions })}
        options={[]}
        onSwitchDimension={() => {}}
      />,
    );
    expect(screen.getByText(/Question 3\?/)).toBeTruthy();
    expect(screen.queryByText(/Question 4\?/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: i18nText('Journal.focus.questionsMore', { count: 3 }) }));
    expect(screen.getByText(/Question 6\?/)).toBeTruthy();
  });

  it('resets expansion when the dimension changes', () => {
    const { rerender } = render(
      <ObservationFocusPanel
        focus={buildFocus({ observableSignals: manySignals })}
        options={[]}
        onSwitchDimension={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: i18nText('Journal.focus.signalsMore', { count: 11 }) }));
    expect(screen.getByText('Signal 15')).toBeTruthy();

    rerender(
      <ObservationFocusPanel
        focus={buildFocus({ dimensionId: 'dim-b', observableSignals: manySignals })}
        options={[]}
        onSwitchDimension={() => {}}
      />,
    );
    expect(screen.queryByText('Signal 5')).toBeNull();
  });
});
