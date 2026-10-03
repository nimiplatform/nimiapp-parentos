// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AISummaryCard } from './ai-summary-card.js';

const textGenerateMock = vi.fn();

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAppSetting: vi.fn().mockResolvedValue(null),
  setAppSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosTextGenerate: (input: unknown) => textGenerateMock(input),
}));

function failWith(reasonCode: string) {
  textGenerateMock.mockResolvedValue({ ok: false, error: { message: reasonCode, reasonCode } });
}

function renderCard() {
  return render(
    <MemoryRouter>
      <AISummaryCard
        domain="overview"
        childName="Mimi"
        childId="child-1"
        ageLabel="4岁11个月"
        gender="female"
        dataContext="身高 110.8 cm"
      />
    </MemoryRouter>,
  );
}

describe('AISummaryCard unavailable guidance (PO-PROF-016)', () => {
  beforeEach(() => {
    textGenerateMock.mockReset();
  });

  it('directs to AI settings instead of retry when no text model is configured', async () => {
    failWith('parentos-ai-capability-not-configured');
    renderCard();

    expect(await screen.findByText('尚未配置 AI 模型，配置后即可查看智能分析')).toBeTruthy();
    expect(screen.getByRole('link', { name: '去配置 AI' }).getAttribute('href')).toBe('/settings/ai');
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull();
  });

  it('asks to open ParentOS from Nimi Desktop and keeps retry when the host bridge is absent', async () => {
    failWith('nimi-shell-runtime-bridge-unavailable');
    renderCard();

    expect(await screen.findByText('请从 Nimi 桌面端的「应用」中打开 ParentOS 后查看智能分析')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps retry next to an AI settings entry for other runtime failures', async () => {
    failWith('runtime-service-unavailable');
    renderCard();

    const retry = await screen.findByRole('button', { name: '重试' });
    expect(screen.getByText('智能分析暂时无法生成，请重试或检查 AI 设置')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AI 设置' }).getAttribute('href')).toBe('/settings/ai');

    textGenerateMock.mockResolvedValue({ ok: true, text: '观察到身高稳步增长。', finishReason: 'stop', traceId: 'trace-1' });
    fireEvent.click(retry);

    expect(await screen.findByText('观察到身高稳步增长。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});
