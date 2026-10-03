// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '@nimiplatform/kit/ui';
import { Moon } from 'lucide-react';
import { DatePickerInput, TimePickerInput } from './sleep-page-pickers.js';

const OPEN_RING_CLASS = /(^|\s)ring-\[var\(--nimi-focus-ring-color\)\](\s|$)/u;

function kitDatePickerOpenSelector(): string {
  const stylesSource = readFileSync(join(process.cwd(), 'src/shell/renderer/styles.css'), 'utf8');
  const match = /(\.group\\\/field:has\([^{]*\)\s*>\s*input)\s*\{[^}]*box-shadow:\s*0 0 0 var\(--nimi-focus-ring-width\) var\(--nimi-focus-ring-color\)/u
    .exec(stylesSource);
  expect(match, 'styles.css must keep the kit DatePicker open-state ring rule').toBeTruthy();
  return match![1]!;
}

describe('date/time picker field highlight', () => {
  beforeAll(() => {
    // jsdom has no Element.scrollTo; the sleep wheel columns call it on mount.
    Element.prototype.scrollTo ??= function scrollTo() {};
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the kit DatePicker field lit for as long as its panel is open', () => {
    // The kit opens its panel two animation frames after the click. Run frames
    // synchronously so the open state never races waitFor's timeout when the
    // suite runs under load.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    const openSelector = kitDatePickerOpenSelector();
    render(<DatePicker value="2026-09-28" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input.matches(openSelector)).toBe(false);

    // Opening from the calendar icon never focuses the input, so the kit's
    // own :focus ring cannot light the field here.
    fireEvent.click(document.querySelector('svg.lucide-calendar')!);
    expect(input.matches(openSelector)).toBe(true);
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(input.matches(openSelector)).toBe(false);
  });

  it('lights the sleep time field with the kit focus ring while its panel is open', () => {
    render(<TimePickerInput value="21:30" onChange={vi.fn()} icon={Moon} />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('focus:ring-[var(--nimi-focus-ring-color)]');
    expect(input.className).not.toContain('--nimi-ring)');
    expect(input.className).not.toMatch(OPEN_RING_CLASS);

    fireEvent.click(input);
    expect(document.body.querySelector('.parentos-time-picker-panel')).toBeTruthy();
    expect(input.className).toMatch(OPEN_RING_CLASS);

    fireEvent.mouseDown(document.body);
    expect(document.body.querySelector('.parentos-time-picker-panel')).toBeNull();
    expect(input.className).not.toMatch(OPEN_RING_CLASS);
  });

  it('lights the sleep date field with the kit focus ring while its panel is open', () => {
    render(<DatePickerInput value="2026-09-27" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('focus:ring-[var(--nimi-focus-ring-color)]');
    expect(input.className).not.toMatch(OPEN_RING_CLASS);

    fireEvent.click(input);
    expect(input.className).toMatch(OPEN_RING_CLASS);
  });
});
