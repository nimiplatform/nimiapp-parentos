// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18nText } from '../../i18n/index.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { OutdoorGoalSetup } from './outdoor-goal-setup.js';
import { MAX_OUTDOOR_GOAL_MINUTES, stepOutdoorGoalMinutes } from './outdoor-helpers.js';

vi.mock('../../infra/telemetry/catch-log.js', () => ({
  catchLog: vi.fn(() => vi.fn()),
}));

function renderSetup(props: Partial<Parameters<typeof OutdoorGoalSetup>[0]> = {}) {
  const onSave = props.onSave ?? vi.fn(async () => {});
  render(<OutdoorGoalSetup initialMinutes={630} {...props} onSave={onSave} />);
  return {
    onSave,
    goal: () => screen.getByRole('spinbutton', { name: i18nText('Outdoor.page.goalSetup.inputAria') }) as HTMLInputElement,
    decrease: () => screen.getByRole('button', { name: i18nText('Outdoor.page.goalSetup.decrease') }) as HTMLButtonElement,
    increase: () => screen.getByRole('button', { name: i18nText('Outdoor.page.goalSetup.increase') }) as HTMLButtonElement,
    preset: (hours: number) => screen.getByRole('button', { name: new RegExp(`^${i18nText('Outdoor.page.goalSetup.dailyPreset', { hours })}`) }),
    save: () => screen.getByRole('button', { name: i18nText('Outdoor.page.goalSetup.confirm') }) as HTMLButtonElement,
  };
}

describe('stepOutdoorGoalMinutes', () => {
  it('moves by ten minutes a day and snaps hand-typed goals onto that grid', () => {
    expect(stepOutdoorGoalMinutes(630, 1)).toBe(700);
    expect(stepOutdoorGoalMinutes(630, -1)).toBe(560);
    expect(stepOutdoorGoalMinutes(600, 1)).toBe(630);
    expect(stepOutdoorGoalMinutes(600, -1)).toBe(560);
  });

  it('never moves against the tap at either bound', () => {
    expect(stepOutdoorGoalMinutes(70, -1)).toBe(70);
    expect(stepOutdoorGoalMinutes(30, -1)).toBe(30);
    expect(stepOutdoorGoalMinutes(0, 1)).toBe(70);
    expect(stepOutdoorGoalMinutes(MAX_OUTDOOR_GOAL_MINUTES, 1)).toBe(MAX_OUTDOOR_GOAL_MINUTES);
  });
});

describe('OutdoorGoalSetup', () => {
  it('opens on the given goal with its daily average and matching quick pick', () => {
    const view = renderSetup();

    expect(view.goal().value).toBe('630');
    expect(screen.getByText(i18nText('Outdoor.page.goalSetup.dailyAverage', { minutes: 90 }))).toBeTruthy();
    expect(view.preset(1.5).getAttribute('aria-pressed')).toBe('true');
    expect(view.preset(1).getAttribute('aria-pressed')).toBe('false');
    expect(view.preset(1.5).textContent).toContain(i18nText('Outdoor.page.goalSetup.suggested'));
  });

  it('steps ten minutes a day at a time and stops at the lowest step', () => {
    const view = renderSetup({ initialMinutes: 140 });

    fireEvent.click(view.increase());
    expect(view.goal().value).toBe('210');
    fireEvent.click(view.decrease());
    fireEvent.click(view.decrease());
    expect(view.goal().value).toBe('70');
    expect(view.decrease().disabled).toBe(true);

    fireEvent.keyDown(view.goal(), { key: 'ArrowUp' });
    expect(view.goal().value).toBe('140');
  });

  it('applies a quick pick as a weekly goal', () => {
    const view = renderSetup();

    fireEvent.click(view.preset(2));
    expect(view.goal().value).toBe('840');
    expect(view.preset(2).getAttribute('aria-pressed')).toBe('true');
    expect(view.preset(1.5).getAttribute('aria-pressed')).toBe('false');
  });

  it('accepts a typed goal, capped at the minutes in a week', () => {
    const view = renderSetup();

    fireEvent.change(view.goal(), { target: { value: '0600' } });
    expect(view.goal().value).toBe('600');
    expect(screen.getByText(i18nText('Outdoor.page.goalSetup.dailyAverage', { minutes: 86 }))).toBeTruthy();

    fireEvent.change(view.goal(), { target: { value: '99999' } });
    expect(view.goal().value).toBe(String(MAX_OUTDOOR_GOAL_MINUTES));
    expect(view.increase().disabled).toBe(true);
  });

  it('blocks saving an empty goal and restores the last one on blur', () => {
    const view = renderSetup();

    fireEvent.change(view.goal(), { target: { value: '720' } });
    fireEvent.change(view.goal(), { target: { value: '' } });
    expect(view.save().disabled).toBe(true);

    fireEvent.blur(view.goal());
    expect(view.goal().value).toBe('720');
    expect(view.save().disabled).toBe(false);
  });

  it('saves the chosen goal', async () => {
    const view = renderSetup();

    fireEvent.click(view.increase());
    await act(async () => { fireEvent.submit(view.goal().form!); });

    expect(view.onSave).toHaveBeenCalledWith(700);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a failed save inline and logs it', async () => {
    const view = renderSetup({ onSave: vi.fn(async () => { throw new Error('bridge down'); }) });

    await act(async () => { fireEvent.click(view.save()); });

    expect(screen.getByRole('alert').textContent).toBe(i18nText('Outdoor.page.goalSetup.saveFailed'));
    expect(vi.mocked(catchLog)).toHaveBeenCalledWith('outdoor', 'action:save-goal-failed');
    expect(view.save().disabled).toBe(false);

    fireEvent.click(view.increase());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers cancel only when there is a goal to fall back to', () => {
    const onCancel = vi.fn();
    const { unmount } = render(<OutdoorGoalSetup initialMinutes={630} onSave={vi.fn(async () => {})} />);
    expect(screen.queryByRole('button', { name: i18nText('Outdoor.page.goalSetup.cancel') })).toBeNull();
    unmount();

    render(<OutdoorGoalSetup initialMinutes={630} onSave={vi.fn(async () => {})} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: i18nText('Outdoor.page.goalSetup.cancel') }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
