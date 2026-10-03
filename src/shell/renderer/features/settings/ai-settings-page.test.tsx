// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { runtimeAIConfigStructToJson } from '@nimiplatform/kit/core/sdk-contract';
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

if (!window.HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
}

const OWNER = { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } };

const LOCAL_TEXT_INTENT = {
  capabilityContract: 'text.generate',
  requiredFeatures: [],
  route: { oneofKind: 'local', local: {} },
};

const CLOUD_TEXT_INTENT = {
  capabilityContract: 'text.generate',
  requiredFeatures: [],
  route: {
    oneofKind: 'cloud',
    cloud: {
      connectorRef: 'connector-work',
      implementation: { implementationId: 'cloud-text', driverId: 'nimillm', driverDialect: 'openai' },
      providerModelTarget: { fields: {} },
    },
  },
};

const DECLARED_CONFIG = { owner: OWNER, capabilities: [LOCAL_TEXT_INTENT] };

const READY_LOCAL_TEXT = {
  capabilityContract: 'text.generate',
  state: 'ready',
  resource: {
    oneofKind: 'local',
    local: {
      loadoutRef: 'text-local',
      label: 'Text local',
      capabilityContract: 'text.generate',
      implementation: { implementationId: 'text-local', driverId: 'local', driverDialect: 'test/local/v1' },
      implementationSupportedFeatures: [],
      configuredFeatures: [],
      textBehaviors: [],
      state: 'ready',
      reasons: [],
    },
  },
  reasons: [],
};

const READY_CLOUD_TEXT = {
  capabilityContract: 'text.generate',
  state: 'ready',
  resource: {
    oneofKind: 'cloud',
    cloud: {
      connector: { connectorRef: 'connector-work', label: 'Work account', provider: 'provider-test', state: 'ready', reasons: [] },
      target: {
        connectorRef: 'connector-work',
        label: 'Cloud text model',
        capabilityContract: 'text.generate',
        implementation: { implementationId: 'cloud-text', driverId: 'nimillm', driverDialect: 'openai' },
        providerModelTarget: { provider: 'provider-test', providerModelId: 'cloud-text-model' },
        supportedFeatures: [],
        state: 'ready',
        reasons: [],
      },
    },
  },
  reasons: [],
};

const DECLARED_SNAPSHOT = {
  config: DECLARED_CONFIG,
  revision: '1',
  effectiveSelections: [READY_LOCAL_TEXT],
};

const NOT_CONFIGURED = {
  state: 'not-configured',
  reasonCode: 'ai-config-not-found',
  snapshot: { config: null, revision: '0', effectiveSelections: [] },
};

function listOptionsWithCloudConnector(query: { kind: string; capabilityContract: string; connectorRef?: string }) {
  if (query.kind === 'local-loadouts') return Promise.resolve({ kind: query.kind, options: [], truncated: false });
  if (query.kind === 'cloud-connectors') {
    return Promise.resolve({
      kind: query.kind,
      options: [{ connectorRef: 'connector-work', label: 'Work account', provider: 'provider-test', state: 'ready', reasons: [] }],
      truncated: false,
    });
  }
  return Promise.resolve({
    kind: query.kind,
    options: [{
      connectorRef: query.connectorRef,
      label: 'Cloud text model',
      capabilityContract: query.capabilityContract,
      implementation: { implementationId: 'cloud-text', driverId: 'nimillm', driverDialect: 'openai' },
      providerModelTarget: { provider: 'provider-test', providerModelId: 'cloud-text-model', remoteModelCatalogId: 'rmc-cloud-text' },
      supportedFeatures: [],
      state: 'ready',
      reasons: [],
    }],
    truncated: false,
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickInAct(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => { (element as HTMLElement).click(); await Promise.resolve(); });
  await flush();
}

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
    parentosAIConfigManagerMock.listOptions.mockReset().mockImplementation(listOptionsWithCloudConnector);
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

  function capabilityRow(container: HTMLElement, contract: string) {
    return container.querySelector(`[data-nimi-model-config-capability="${contract}"]`);
  }

  it('renders the Nimi access posture and the shared AI models editor', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 设置')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('已连接');
      expect(container.textContent).toContain('AI 模型');
      expect(container.textContent).toContain('已配置 1 项能力');
      expect(capabilityRow(container, 'text.generate')?.textContent).toContain('文本生成');
      expect(capabilityRow(container, 'audio.transcribe')?.textContent).toContain('语音转写');
    });
    expect(container.querySelector('[data-nimi-model-config-owner="app-ai-config"]')?.getAttribute('data-nimi-model-config-app-id'))
      .toBe('nimi.parentos');
  });

  it('distinguishes configured, configurable, and unsupported features and names the route', async () => {
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
    const advisor = await screen.findByText('成长顾问');
    expect(advisor.parentElement?.textContent).toContain('本地模型');
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
    await waitFor(() => expect(advisor.parentElement?.textContent).toContain('暂不可用'));
    expect(advisor.parentElement?.textContent).not.toContain('需在 Nimi 中配置');
  });

  it('treats a ready Cloud route as available and names it for each feature', async () => {
    readParentosAIConfigMock.mockResolvedValue({
      state: 'ready',
      snapshot: {
        config: { owner: OWNER, capabilities: [CLOUD_TEXT_INTENT] },
        revision: '3',
        effectiveSelections: [READY_CLOUD_TEXT],
      },
    });
    renderPage();

    const advisor = await screen.findByText('成长顾问');
    await waitFor(() => expect(advisor.parentElement?.textContent).toContain('可用'));
    expect(advisor.parentElement?.textContent).toContain('云端模型');
    expect(advisor.parentElement?.textContent).not.toContain('暂不可用');
    expect(document.body.textContent).not.toMatch(/仅限本地|不提供新的云端选项|改为本地/u);
  });

  it('offers Local and Cloud choices in-App and commits the chosen Cloud target', async () => {
    readParentosAIConfigMock.mockResolvedValue(NOT_CONFIGURED);
    parentosAIConfigManagerMock.overwrite.mockImplementation(async (input) => ({
      outcome: 'committed',
      config: { owner: OWNER, capabilities: [...input.capabilities] },
      revision: '1',
    }));
    const { container } = renderPage();

    await waitFor(() => expect(capabilityRow(container, 'text.generate')).toBeTruthy());
    await clickInAct(capabilityRow(container, 'text.generate'));
    await clickInAct(container.querySelector('[data-testid="model-config-model-trigger:text.generate"]'));

    const sourceButton = (label: string) => Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === label);
    expect(sourceButton('本地')).toBeTruthy();
    await clickInAct(sourceButton('云端'));
    await clickInAct(document.body.querySelector('button[aria-label="云端连接器"]'));
    await clickInAct(Array.from(document.body.querySelectorAll('[role="option"]'))
      .find((option) => option.textContent?.includes('Work account')));
    expect(parentosAIConfigManagerMock.listOptions).toHaveBeenCalledWith({
      kind: 'cloud-targets', capabilityContract: 'text.generate', connectorRef: 'connector-work',
    });
    await clickInAct(Array.from(document.body.querySelectorAll('[data-nimi-model-picker-source="cloud"]'))
      .find((entry) => entry.textContent?.includes('Cloud text model')));
    await clickInAct(sourceButton('使用此选择'));
    expect(document.body.textContent).toContain('会把每次请求所需的内容发送给该服务商');
    await clickInAct(container.querySelector('[data-testid="model-config-save:text.generate"]'));

    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(1));
    const input = parentosAIConfigManagerMock.overwrite.mock.calls[0]?.[0];
    expect(input.expectedRevision).toBe('0');
    expect(input.capabilities).toHaveLength(1);
    const saved = input.capabilities[0];
    expect(saved.capabilityContract).toBe('text.generate');
    expect(saved.route.oneofKind).toBe('cloud');
    expect(saved.route.cloud.connectorRef).toBe('connector-work');
    expect(runtimeAIConfigStructToJson(saved.route.cloud.providerModelTarget)).toMatchObject({
      provider: 'provider-test',
      providerModelId: 'cloud-text-model',
    });
  });

  it('uses the mutation acknowledgement revision before background effective refresh completes', async () => {
    readParentosAIConfigMock
      .mockReset()
      .mockResolvedValueOnce({ state: 'ready', snapshot: DECLARED_SNAPSHOT })
      .mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-unavailable' });
    parentosAIConfigManagerMock.overwrite.mockImplementation(async (input) => ({
      outcome: 'committed',
      config: { owner: OWNER, capabilities: [...input.capabilities] },
      revision: String(Number(input.expectedRevision) + 1),
    }));
    const { container } = renderPage();

    await waitFor(() => expect(capabilityRow(container, 'text.generate')).toBeTruthy());
    await clickInAct(capabilityRow(container, 'text.generate'));
    await clickInAct(container.querySelector('[data-testid="model-config-clear:text.generate"]'));
    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(1));
    expect(parentosAIConfigManagerMock.overwrite.mock.calls[0]?.[0]).toEqual({ expectedRevision: '1', capabilities: [] });

    await clickInAct(container.querySelector('[data-testid="model-config-model-trigger:text.generate"]'));
    await clickInAct(Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '云端'));
    expect(parentosAIConfigManagerMock.listOptions).toHaveBeenCalledWith({
      kind: 'cloud-connectors', capabilityContract: 'text.generate',
    });
    await clickInAct(document.body.querySelector('button[aria-label="云端连接器"]'));
    await clickInAct(Array.from(document.body.querySelectorAll('[role="option"]'))
      .find((option) => option.textContent?.includes('Work account')));
    await clickInAct(Array.from(document.body.querySelectorAll('[data-nimi-model-picker-source="cloud"]'))
      .find((entry) => entry.textContent?.includes('Cloud text model')));
    await clickInAct(Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '使用此选择'));
    await clickInAct(container.querySelector('[data-testid="model-config-save:text.generate"]'));
    await waitFor(() => expect(parentosAIConfigManagerMock.overwrite).toHaveBeenCalledTimes(2));
    expect(parentosAIConfigManagerMock.overwrite.mock.calls[1]?.[0].expectedRevision).toBe('2');
    expect(parentosAIConfigManagerMock.overwrite.mock.calls[1]?.[0].capabilities[0]?.route.oneofKind).toBe('cloud');
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
    readParentosAIConfigMock.mockResolvedValue(NOT_CONFIGURED);

    const { container } = renderPage();

    await waitFor(() => {
      expect(capabilityRow(container, 'text.generate')?.textContent).toContain('用于成长顾问、成长报告、日记标记和智能摘要。');
      expect(container.textContent).toContain('编辑的是同一份配置');
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
    readParentosAIConfigMock.mockResolvedValue(NOT_CONFIGURED);
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
