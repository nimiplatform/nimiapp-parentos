import { beforeEach, describe, expect, it, vi } from 'vitest';

const { installNimiShellRuntimeBridgeMock } = vi.hoisted(() => ({
  installNimiShellRuntimeBridgeMock: vi.fn(),
}));

vi.mock('@nimiplatform/kit/shell/renderer/bridge', () => ({
  installNimiShellRuntimeBridge: installNimiShellRuntimeBridgeMock,
}));

import { installParentosTauriRuntimeHook } from './tauri-runtime-hook.js';

describe('installParentosTauriRuntimeHook', () => {
  beforeEach(() => {
    installNimiShellRuntimeBridgeMock.mockReset();
  });

  it('delegates runtime transport hook installation to the shared Kit bridge', () => {
    installNimiShellRuntimeBridgeMock.mockReturnValue({
      installed: false,
      reason: 'non-tauri-environment',
    });

    expect(installParentosTauriRuntimeHook()).toEqual({
      installed: false,
      reason: 'non-tauri-environment',
    });
    expect(installNimiShellRuntimeBridgeMock).toHaveBeenCalledTimes(1);
  });
});
