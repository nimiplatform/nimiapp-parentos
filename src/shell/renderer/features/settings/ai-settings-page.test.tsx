// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestNavigation } from '../../testing/navigation.js';
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
        <TestNavigation>
          <AiSettingsPage />
        </TestNavigation>
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
      expect(container.textContent).toContain('已保存 1 项设置');
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
      expect(container.textContent).toContain('尚未选择模型');
      expect(container.textContent).toContain('当前版本暂不支持');
      expect(container.textContent).toContain('无法手动开启');
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
    expect(advisor.parentElement?.textContent).not.toContain('尚未选择模型');
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
    await clickInAct(sourceButton('确认选择'));
    expect(document.body.textContent).toContain('把处理所需的内容发送给对应服务商');
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

  it('locks the acknowledged configuration after a failed read and resumes with its current revision', async () => {
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

    await waitFor(() => expect(container.textContent).toContain('配置未读取，待确认'));
    expect(container.querySelector<HTMLButtonElement>('[data-testid="model-config-model-trigger:text.generate"]')?.disabled).toBe(true);
    readParentosAIConfigMock.mockResolvedValue({ state: 'ready', snapshot: {
      config: { owner: OWNER, capabilities: [] }, revision: '2', effectiveSelections: [],
    } });
    fireEvent.click(screen.getByRole('button', { name: '重新读取配置' }));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('[data-testid="model-config-model-trigger:text.generate"]')?.disabled).toBe(false));
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
      .find((button) => button.textContent?.trim() === '确认选择'));
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
      expect(container.textContent).toContain('Nimi 连接尚未就绪');
      expect(container.textContent).toContain('请确认 Nimi 正在运行');
      expect(container.textContent).toContain('连接未就绪，待确认');
    });
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.textContent).toContain('runtime-service-unavailable');
    expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '在 Nimi 中管理' })).toBeNull();
  });

  it('offers direct self-owner configuration with an optional Nimi handoff', async () => {
    readParentosAIConfigMock.mockResolvedValue(NOT_CONFIGURED);

    const { container } = renderPage();

    await waitFor(() => {
      expect(capabilityRow(container, 'text.generate')?.textContent).toContain('用于成长顾问、成长报告、日记标记和智能摘要。');
      expect(container.textContent).toContain('编辑同一份设置');
    });
    const configureButton = screen.getByRole('button', { name: '在 Nimi 中管理' });
    fireEvent.click(configureButton);
    await waitFor(() => {
      expect(openDesktopIntentMock).toHaveBeenCalledWith({
        intent: { kind: 'open-apps', appId: 'nimi.parentos', section: 'ai-models' },
      });
    });
  });

  it('directs a trust failure to connection repair without asking to change models', async () => {
    probeParentosNimiAccessMock.mockResolvedValue({
      state: 'unavailable', reasonCode: 'runtime-service-untrusted',
      actionHint: 'restart_fixed_runtime_service', retryable: false,
    });
    readParentosAIConfigMock.mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-untrusted' });
    const { container } = renderPage();
    await screen.findByText('Nimi 运行时校验未通过');
    expect(container.textContent).toContain('无需清除现有模型配置');
    expect(screen.queryByRole('button', { name: '在 Nimi 中管理' })).toBeNull();
    expect(parentosAIConfigManagerMock.overwrite).not.toHaveBeenCalled();
    expect(container.querySelector('[data-nimi-model-config-capability]')).toBeNull();

    probeParentosNimiAccessMock.mockResolvedValue({ state: 'ready', reasonCode: 'session-bound', actionHint: '', retryable: false });
    readParentosAIConfigMock.mockResolvedValue(NOT_CONFIGURED);
    fireEvent.click(screen.getByRole('button', { name: '重试连接' }));
    await waitFor(() => expect(capabilityRow(container, 'text.generate')).toBeTruthy());
    expect(screen.queryByText('Nimi 运行时校验未通过')).toBeNull();
  });

  it('does not confuse an unread configuration with an absent model', async () => {
    readParentosAIConfigMock.mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-permission-denied' });
    renderPage();
    const advisor = await screen.findByText('成长顾问');
    await waitFor(() => expect(advisor.parentElement?.textContent).toContain('配置未读取，待确认'));
    expect(advisor.parentElement?.textContent).not.toContain('尚未选择模型');
  });

  it('invalidates cached readiness and disables writes when refresh fails', async () => {
    const { container } = renderPage();
    const advisor = await screen.findByText('成长顾问');
    await waitFor(() => expect(advisor.parentElement?.textContent).toContain('本地模型'));
    await clickInAct(capabilityRow(container, 'text.generate'));
    readParentosAIConfigMock.mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-unavailable' });
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    await waitFor(() => expect(advisor.parentElement?.textContent).toContain('配置未读取，待确认'));
    expect(advisor.parentElement?.textContent).not.toContain('本地模型');
    expect(screen.queryByText('已保存 1 项设置')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="model-config-clear:text.generate"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="model-config-model-trigger:text.generate"]')?.disabled).toBe(true);
  });

  it('ignores an older refresh that completes after a newer failed refresh', async () => {
    let completeOldRead!: (value: unknown) => void;
    const { container } = renderPage();
    await waitFor(() => expect(capabilityRow(container, 'text.generate')).toBeTruthy());
    readParentosAIConfigMock.mockImplementationOnce(() => new Promise((resolve) => { completeOldRead = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    readParentosAIConfigMock.mockResolvedValue({ state: 'unavailable', reasonCode: 'runtime-service-unavailable' });
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(container.textContent).toContain('配置未读取，待确认'));
    await act(async () => { completeOldRead({ state: 'ready', snapshot: DECLARED_SNAPSHOT }); });
    expect(container.textContent).toContain('配置未读取，待确认');
    expect(screen.queryByText('已保存 1 项设置')).toBeNull();
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

    const configureButton = await screen.findByRole('button', { name: '在 Nimi 中管理' });
    fireEvent.click(configureButton);
    await waitFor(() => {
      expect(screen.getByText('未能打开 Nimi 管理页')).toBeTruthy();
      expect(screen.getByText('请手动打开 Nimi，进入「应用 > ParentOS > AI 模型」。连接恢复后也可留在本页配置模型。')).toBeTruthy();
    });
  });
});
