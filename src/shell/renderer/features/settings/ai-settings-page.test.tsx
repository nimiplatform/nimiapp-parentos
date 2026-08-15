// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/index.js';
import AiSettingsPage from './ai-settings-page.js';

const probeParentosNimiAccessMock = vi.fn();
const readParentosAIConfigMock = vi.fn();

vi.mock('../../infra/runtime-status.js', () => ({
  probeParentosNimiAccess: () => probeParentosNimiAccessMock(),
}));

vi.mock('./parentos-ai-config.js', () => ({
  readParentosAIConfig: () => readParentosAIConfigMock(),
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

  it('lists text features as available and vision/STT gaps as unavailable', async () => {
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

  it('keeps missing capability configuration read-only', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'ready',
      config: { ...DECLARED_CONFIG, capabilities: [] },
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('尚未配置任何能力');
      expect(container.textContent).toContain('由 Nimi 平台管理');
    });
    expect(screen.queryByRole('button', { name: '声明文本生成能力' })).toBeNull();
  });
});
