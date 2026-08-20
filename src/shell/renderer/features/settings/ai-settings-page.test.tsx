// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/index.js';
import AiSettingsPage from './ai-settings-page.js';

const probeParentosNimiAccessMock = vi.fn();
const readParentosAIConfigMock = vi.fn();
const openDesktopIntentMock = vi.fn();

vi.mock('../../infra/runtime-status.js', () => ({
  probeParentosNimiAccess: () => probeParentosNimiAccessMock(),
}));

vi.mock('./parentos-ai-config.js', () => ({
  readParentosAIConfig: () => readParentosAIConfigMock(),
}));

vi.mock('@nimiplatform/kit/shell/renderer/bridge', () => ({
  openDesktopIntent: (request: unknown) => openDesktopIntentMock(request),
}));

const DECLARED_CONFIG = {
  owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
  capabilities: [
    { capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } },
  ],
};

describe('AiSettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    probeParentosNimiAccessMock.mockReset().mockResolvedValue({
      state: 'ready',
      reasonCode: 'session-bound',
      actionHint: 'continue_local_app_session',
      retryable: true,
    });
    readParentosAIConfigMock.mockReset().mockResolvedValue({ state: 'ready', config: DECLARED_CONFIG });
    openDesktopIntentMock.mockReset().mockResolvedValue({
      status: 'accepted',
      confirmation: 'desktop-accepted',
      bridgeId: 'desktop-open-bridge-1',
      requestId: 'desktop-open-request-1',
      appliedTarget: 'open-apps',
    });
  });

  function renderPage() {
    return render(
      <TooltipProvider>
        <MemoryRouter>
          <AiSettingsPage />
        </MemoryRouter>
      </TooltipProvider>,
    );
  }

  it('renders the Nimi access posture and declared text capability', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 设置')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('已连接');
      expect(container.textContent).toContain('text.generate');
      expect(container.textContent).toContain('本地路由');
    });
  });

  it('lists text and STT as supported while keeping vision OCR unavailable', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 设置')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('成长顾问');
      expect(container.textContent).toContain('报告图片识别');
      expect(container.textContent).toContain('语音转写');
      expect(container.textContent).toContain('暂不可用');
    });
  });

  it('keeps machine codes inside the collapsed technical details when unavailable', async () => {
    probeParentosNimiAccessMock.mockResolvedValue({
      state: 'unavailable',
      reasonCode: 'runtime-service-unavailable',
      actionHint: 'retry_or_restart_nimi_runtime',
      retryable: true,
    });
    readParentosAIConfigMock.mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-unavailable' });

    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('暂不可用');
    });
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.textContent).toContain('runtime-service-unavailable');
  });

  it('keeps missing capability configuration read-only and hands changes to Nimi', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('尚未配置任何能力');
      expect(container.textContent).toContain('由 Nimi 平台管理');
    });
    const configureButton = screen.getByRole('button', { name: '在 Nimi 中配置' });
    fireEvent.click(configureButton);
    await waitFor(() => {
      expect(openDesktopIntentMock).toHaveBeenCalledWith({
        intent: { kind: 'open-apps', appId: 'nimi.parentos', section: 'ai-models' },
      });
    });
  });
});
