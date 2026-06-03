// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { i18n } from '../../i18n/index.js';
import { PARENTOS_AI_SCOPE_REF, createEmptyParentosAIConfig } from './parentos-ai-config.js';
import AiSettingsPage from './ai-settings-page.js';

vi.mock('@nimiplatform/sdk', () => ({
  getPlatformClient: () => ({
    runtime: {
      appId: 'ai.nimi.apps.parentos',
    },
  }),
}));

vi.mock('./parentos-ai-settings-availability.js', () => ({
  probeParentosAISettingsAvailability: vi.fn(async () => ({
    kind: 'ready',
    status: {
      running: true,
      managed: true,
      launchMode: 'RUNTIME',
      grpcAddr: '127.0.0.1:46371',
    },
  })),
  parentosAISettingsAvailabilityLabel: () => '运行时已连接',
  parentosAISettingsAvailabilityBannerCopy: () => null,
}));

describe('AiSettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    useAppStore.setState({
      aiConfig: null,
      bootstrapReady: true,
      bootstrapError: null,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      aiConfig: null,
      bootstrapReady: false,
      bootstrapError: null,
    });
  });

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <AiSettingsPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  }

  it('renders ParentOS-owned AI capability bindings without raw ModelConfig keys', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 模型设置')).toBeTruthy();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('ParentOS AI 能力');
      expect(container.textContent).toContain('AI 对话');
      expect(container.textContent).toContain('智能识别');
      expect(container.textContent).toContain('语音转写');
      expect(container.textContent).not.toContain('ModelConfig.');
    });
  });

  it('does not render the empty AI profile import path', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 模型设置')).toBeTruthy();
    });

    const importTriggers = Array.from(container.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('导入 AI 预设'));
    expect(importTriggers.length).toBe(0);
  });

  it('projects persisted text model binding status', async () => {
    useAppStore.setState({
      aiConfig: {
        ...createEmptyParentosAIConfig(),
        scopeRef: { ...PARENTOS_AI_SCOPE_REF },
        capabilities: {
          selectedBindings: {
            'text.generate': {
              source: 'local',
              connectorId: '',
              model: 'asset-gemma-4-26b-a4b',
              modelId: 'asset-gemma-4-26b-a4b',
              modelLabel: 'local-import/gemma-4-26B-A4B-it-Q8_0',
              localModelId: 'local-import/gemma-4-26B-A4B-it-Q8_0',
              engine: 'llama',
              provider: 'llama',
            },
          },
          localProfileRefs: {},
          selectedParams: {},
        },
      },
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('local-import/gemma-4-26B-A4B-it-Q8_0');
      expect(container.textContent).toContain('模型已配置');
      expect(container.textContent).toContain('1 / 3 已绑定');
    });
  });

  it('enables exactly the three ParentOS canonical capabilities (no image/video/voice/embed/world sections)', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('AI 模型设置')).toBeTruthy();
    });

    // Sections that must NOT render because their capability ids are not enabled.
    expect(container.textContent).not.toContain('文本转语音');
    expect(container.textContent).not.toContain('图像');
    expect(container.textContent).not.toContain('视频');
    expect(container.textContent).not.toContain('嵌入');
    expect(container.textContent).not.toContain('世界');
    expect(container.textContent).not.toContain('ModelConfig.');
  });
});
