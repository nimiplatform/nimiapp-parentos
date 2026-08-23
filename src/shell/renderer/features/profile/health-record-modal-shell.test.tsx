// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, DatePicker, TextField } from '@nimiplatform/kit/ui';
import {
  HealthRecordModalShell,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';

const NUMBER_INPUT_CLASS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

describe('HealthRecordModalShell', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders profile modals through a viewport-level solid overlay shell', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const { container } = render(
      <HealthRecordModalShell open size="M" ariaLabel="growth-record-modal" onClose={vi.fn()}>
        <ModalHeader title="添加生长记录" icon="📏" onClose={vi.fn()} />
        <ModalContent>
          <TextField
            aria-label="height"
            type="number"
            defaultValue="120.5"
            className="w-full min-h-12"
            inputClassName={NUMBER_INPUT_CLASS}
          />
        </ModalContent>
        <ModalFooter>
          <Button type="button" onClick={vi.fn()} tone="primary" size="md">保存</Button>
        </ModalFooter>
      </HealthRecordModalShell>,
      { container: host },
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const dialog = screen.getByRole('dialog', { name: 'growth-record-modal' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('top-1/2');
    expect(dialog.className).toContain('parentos-health-modal-panel');
    expect(dialog.style.borderRadius).toBe('14px');
    expect(dialog.style.overflow).toBe('hidden');

    const surface = dialog.querySelector('.parentos-health-modal-surface') as HTMLElement | null;
    expect(surface?.style.borderRadius).toBe('14px');

    const backdrop = document.body.querySelector('.nimi-overlay-backdrop');
    expect(backdrop).not.toBeNull();

    const footer = dialog.querySelector('footer');
    expect(footer?.className).toContain('bg-[var(--nimi-surface-card)]');
    expect(footer?.className).not.toContain('glass');

    const numberInput = screen.getByLabelText('height');
    expect(numberInput.className).toContain('[appearance:textfield]');
    expect(numberInput.className).toContain('[&::-webkit-inner-spin-button]:appearance-none');
  });

  it('keeps date picker panels above the modal shell layer', async () => {
    render(
      <HealthRecordModalShell open size="M" ariaLabel="growth-record-modal" onClose={vi.fn()}>
        <ModalHeader title="添加生长记录" icon="📏" onClose={vi.fn()} />
        <ModalContent>
          <DatePicker value="2026-05-14" onChange={vi.fn()} className="h-12" />
        </ModalContent>
      </HealthRecordModalShell>,
    );

    fireEvent.click(screen.getByRole('textbox'));

    await waitFor(() => {
      const panel = document.body.querySelector('.nimi-date-picker-panel');
      expect(panel).toBeTruthy();
      expect(panel?.className).toContain('z-[var(--nimi-z-popover)]');
    });

    const stylesSource = readFileSync(
      join(process.cwd(), 'src/shell/renderer/styles.css'),
      'utf8',
    );
    expect(stylesSource).toMatch(/\.nimi-date-picker-panel\s*\{[^}]*z-index:\s*calc\(var\(--nimi-z-dialog\) \+ 1\)/u);
  });

  it.each([
    ['S', '460px'],
    ['M', '720px'],
    ['L', '920px'],
    ['XL', '1040px'],
  ] as const)('assigns %s width to the overlay panel itself', (size, width) => {
    render(
      <HealthRecordModalShell open size={size} ariaLabel={`${size}-record-modal`} onClose={vi.fn()}>
        <ModalHeader title="添加记录" onClose={vi.fn()} />
        <ModalContent>content</ModalContent>
      </HealthRecordModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: `${size}-record-modal` });
    expect(dialog.style.width).toBe(width);
    expect(dialog.style.maxWidth).toBe('calc(100vw - 32px)');
  });
});
