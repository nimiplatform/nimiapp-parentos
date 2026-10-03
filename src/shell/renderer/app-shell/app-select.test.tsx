// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSelect } from './app-select.js';

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: vi.fn(() => false),
});
Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: vi.fn(),
});

describe('AppSelect', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the trigger lit while the dropdown is open', () => {
    render(
      <AppSelect
        value="a"
        onChange={vi.fn()}
        options={[
          { value: 'a', label: '选项 A' },
          { value: 'b', label: '选项 B' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('data-[state=open]:border-[var(--nimi-field-focus)]');
    expect(trigger.className).toContain('data-[state=open]:ring-[length:var(--nimi-focus-ring-width)]');
    expect(trigger.className).toContain('data-[state=open]:ring-[var(--nimi-focus-ring-color)]');
    expect(trigger.getAttribute('data-state')).toBe('closed');

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    // Radix keeps focus off the trigger while open, so only the
    // data-[state=open] variants (not the kit's focus: ones) can light it.
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(document.activeElement).not.toBe(trigger);
  });
});
