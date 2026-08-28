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
const parentosAIConfigManagerMock = {
  overwrite: vi.fn(),
  listOptions: vi.fn(),
};

vi.mock('../../infra/runtime-status.js', () => ({
  probeParentosNimiAccess: () => probeParentosNimiAccessMock(),
}));

vi.mock('./parentos-ai-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./parentos-ai-config.js')>()),
  readParentosAIConfig: () => readParentosAIConfigMock(),
  getParentosAIConfigManager: () => parentosAIConfigManagerMock,
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

const DECLARED_SNAPSHOT = {
  config: DECLARED_CONFIG,
  revision: '1',
  effectiveSelections: [{
    capabilityContract: 'text.generate',
    state: 'ready',
    resource: {
      oneofKind: 'local',
      local: {
        loadoutRef: 'text-local',
        label: 'Text local',
        capabilityContract: 'text.generate',
        implementation: { implementationId: 'text-local', driverId: 'local', driverDialect: 'test/local/v1' },
        supportedFeatures: [],
        state: 'ready',
        reasons: [],
      },
    },
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
    readParentosAIConfigMock.mockReset().mockResolvedValue({ state: 'ready', snapshot: DECLARED_SNAPSHOT });
    parentosAIConfigManagerMock.overwrite.mockReset();
    parentosAIConfigManagerMock.listOptions.mockReset();
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

  it('shows a committed but missing Local route as unavailable instead of unconfigured', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'ready',
      snapshot: {
        ...DECLARED_SNAPSHOT,
        effectiveSelections: [{
          capabilityContract: 'text.generate',
          state: 'missing',
          resource: null,
          reasons: ['AI_LOCAL_SELECTION_NOT_FOUND'],
        }],
      },
    });
    renderPage();

    const advisor = await screen.findByText('成长顾问');
    expect(advisor.parentElement?.textContent).toContain('暂不可用');
    expect(advisor.parentElement?.textContent).not.toContain('需在 Nimi 中配置');
  });

  it('offers only the route-only Local intent under the ParentOS privacy boundary', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
      snapshot: { config: null, revision: '0', effectiveSelections: [] },
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('button[data-parentos-ai-config-capability="text.generate"]')).toBeTruthy());
    const textCapability = container.querySelector('button[data-parentos-ai-config-capability="text.generate"]') as HTMLButtonElement;
    fireEvent.click(textCapability);
    expect(await screen.findByRole('button', { name: '使用本地路由' })).toBeTruthy();
    expect(screen.queryByText('云端路由')).toBeNull();
    expect(parentosAIConfigManagerMock.listOptions).not.toHaveBeenCalled();
  });

  it('shows an existing Cloud intent but only permits clearing it or changing it to Local', async () => {
    const cloudIntent = {
      capabilityContract: 'text.generate',
      requiredFeatures: [],
      route: {
        oneofKind: 'cloud',
        cloud: {
          connectorRef: 'cloud-connector',
          implementation: { implementationId: 'cloud.text', driverId: 'cloud', driverDialect: 'test/cloud/v1' },
          providerModelTarget: { fields: {} },
        },
      },
    };
    readParentosAIConfigMock.mockResolvedValue({
      state: 'ready',
      snapshot: {
        config: { ...DECLARED_CONFIG, capabilities: [cloudIntent] },
        revision: '4',
        effectiveSelections: [],
      },
    });
    parentosAIConfigManagerMock.overwrite.mockResolvedValue({
      outcome: 'committed',
      config: { ...DECLARED_CONFIG, capabilities: [{
        capabilityContract: 'text.generate',
        requiredFeatures: [],
        route: { oneofKind: 'local', local: {} },
      }] },
      revision: '5',
    });
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('button[data-parentos-ai-config-capability="text.generate"]')).toBeTruthy());
    fireEvent.click(container.querySelector('button[data-parentos-ai-config-capability="text.generate"]') as HTMLButtonElement);
    expect(await screen.findByText(/当前使用云端路由/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: '清除配置' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '使用本地路由' }));

    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(1));
    const input = parentosAIConfigManagerMock.overwrite.mock.calls[0]?.[0];
    expect(input.expectedRevision).toBe('4');
    expect(input.capabilities).toHaveLength(1);
    expect(input.capabilities[0]?.route.oneofKind).toBe('local');
    expect(parentosAIConfigManagerMock.listOptions).not.toHaveBeenCalled();
  });

  it('uses the mutation acknowledgement revision before background effective refresh completes', async () => {
    readParentosAIConfigMock
      .mockReset()
      .mockResolvedValueOnce({ state: 'ready', snapshot: DECLARED_SNAPSHOT })
      .mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-unavailable' });
    parentosAIConfigManagerMock.overwrite.mockImplementation(async (input) => ({
      outcome: 'committed',
      config: { ...DECLARED_CONFIG, capabilities: [...input.capabilities] },
      revision: String(Number(input.expectedRevision) + 1),
    }));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('button[data-parentos-ai-config-capability="text.generate"]')).toBeTruthy());
    fireEvent.click(container.querySelector('button[data-parentos-ai-config-capability="text.generate"]') as HTMLButtonElement);
    const clear = container.querySelector('[data-testid="parentos-ai-config-clear:text.generate"]') as HTMLButtonElement;
    fireEvent.click(clear);
    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(1));
    const save = container.querySelector('[data-testid="parentos-ai-config-save:text.generate"]') as HTMLButtonElement;
    fireEvent.click(save);
    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(2));
    expect(parentosAIConfigManagerMock.overwrite.mock.calls[1]?.[0].expectedRevision).toBe('2');
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

  it('offers direct self-owner configuration with an optional Nimi handoff', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
      snapshot: { config: null, revision: '0', effectiveSelections: [] },
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('尚未配置任何能力');
      expect(container.textContent).toContain('Runtime 拥有 canonical 配置');
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
      snapshot: { config: null, revision: '0', effectiveSelections: [] },
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
