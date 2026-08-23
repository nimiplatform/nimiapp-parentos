// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaccineCaptureModal } from './vaccine-capture-form.js';

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

describe('VaccineCaptureModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the vaccine options panel above the modal shell', async () => {
    render(
      <VaccineCaptureModal
        child={{ childId: 'child-1', birthDate: '2020-01-01' }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('combobox'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });

    await waitFor(() => {
      const panel = document.body.querySelector('[data-nimi-select-layer="dialog"]');
      expect(panel).toBeTruthy();
      expect(panel?.className).toContain('z-[calc(var(--nimi-z-dialog)+1)]');
    });
  });
});
