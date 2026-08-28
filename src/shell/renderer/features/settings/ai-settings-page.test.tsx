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
  config: {
    owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
    capabilities: [
      { capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } },
    ],
  },
  revision: 'rev-1',
  effectiveSelections: [{
    capabilityContract: 'text.generate',
    state: 'ready',
    resource: { oneofKind: 'local', local: {} },
    reasons: [],
  }],
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
      expect(container.textContent).toContain('文本生成');
      expect(container.textContent).toContain('text.generate');
      expect(container.textContent).toContain('本地路由');
      expect(container.textContent).toContain('已配置');
      expect(container.textContent).toContain('已配置 1 项能力意图');
    });
  });

  it('distinguishes configured, configurable, and unsupported features', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 设置')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('成长顾问');
      expect(container.textContent).toContain('报告图片识别');
      expect(container.textContent).toContain('语音转写');
      expect(container.textContent).toContain('可用');
      expect(container.textContent).toContain('需在 Nimi 中配置');
      expect(container.textContent).toContain('当前版本暂不支持');
      expect(container.textContent).toContain('暂时无法手动开启');
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
      expect(container.textContent).toContain('让 AI 功能恢复可用');
      expect(container.textContent).toContain('应用 > ParentOS > AI 能力');
      expect(container.textContent).toContain('连接 Nimi 后可用');
    });
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.textContent).toContain('runtime-service-unavailable');
    expect(screen.getAllByRole('button', { name: /在 Nimi 中配置/ }).length).toBeGreaterThan(0);
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

  it('shows a manual path when the Nimi configuration handoff fails', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
    });
    openDesktopIntentMock.mockResolvedValue({
      status: 'rejected',
      reasonCode: 'desktop-open-host-unavailable',
      actionHint: 'check_desktop_runtime_bridge',
      retryable: true,
    });

    renderPage();

    const configureButton = await screen.findByRole('button', { name: '在 Nimi 中配置' });
    fireEvent.click(configureButton);
    await waitFor(() => {
      expect(screen.getByText('未能自动打开 Nimi 配置页')).toBeTruthy();
      expect(screen.getByText('请手动打开 Nimi 桌面端，进入「应用 > ParentOS > AI 能力」。')).toBeTruthy();
    });
  });
});
