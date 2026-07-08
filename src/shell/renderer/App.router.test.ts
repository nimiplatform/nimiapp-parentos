import { describe, expect, it } from 'vitest';
import { shouldUseParentOSHashRouter } from './App.js';

describe('ParentOS router mode', () => {
  it('uses hash routing only for packaged Electron file renderers', () => {
    expect(shouldUseParentOSHashRouter({
      electronRuntime: true,
      locationProtocol: 'file:',
    })).toBe(true);

    expect(shouldUseParentOSHashRouter({
      electronRuntime: true,
      locationProtocol: 'http:',
    })).toBe(false);

    expect(shouldUseParentOSHashRouter({
      electronRuntime: false,
      locationProtocol: 'file:',
    })).toBe(false);
  });
});
