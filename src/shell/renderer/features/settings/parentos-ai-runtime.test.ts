import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();
const requireCapabilityMock = vi.fn();

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => ({
    ai: { scenario: { execute: executeMock } },
  }),
}));

vi.mock('./parentos-ai-config.js', () => ({
  requireParentosAIConfigCapability: () => requireCapabilityMock(),
  PARENTOS_TEXT_CAPABILITY_CONTRACT: 'text.generate',
}));

import {
  createParentosAISurfaceUnavailableError,
  runParentosTextGenerate,
} from './parentos-ai-runtime.js';

function textMessage(role: 'system' | 'user', text: string) {
  return { role, content: [{ type: 'text' as const, text }] };
}

describe('runParentosTextGenerate (bounded synchronous text contract)', () => {
  beforeEach(() => {
    requireCapabilityMock.mockReset().mockResolvedValue(undefined);
    executeMock.mockReset().mockResolvedValue({
      output: { type: 'text-generate', items: [{ type: 'text', text: '观察到孩子在持续积累。' }], finishReason: 'stop' },
      traceId: 'trace-1',
    });
  });

  it('fails closed before dispatch when the Nimi-owned text intent is missing', async () => {
    requireCapabilityMock.mockRejectedValue(Object.assign(new Error('missing'), {
      reasonCode: 'parentos-ai-capability-not-configured',
    }));

    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [textMessage('user', '问题')],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { reasonCode: 'parentos-ai-capability-not-configured' },
    });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('preserves a typed AIConfig access failure before dispatch', async () => {
    requireCapabilityMock.mockRejectedValue(Object.assign(new Error('denied'), {
      reasonCode: 'local-app-access-denied',
    }));

    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [textMessage('user', '问题')],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { reasonCode: 'local-app-access-denied' },
    });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('maps system+user messages onto synchronous text.generate with clamped defaults', async () => {
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [textMessage('system', '规则'), textMessage('user', '问题')],
      defaults: { temperature: 0.5, maxTokens: 99999 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('观察到');
      expect(result.finishReason).toBe('stop');
      expect(result.traceId).toBe('trace-1');
    }
    expect(executeMock).toHaveBeenCalledWith({
      type: 'text-generate',
      messages: [
        { role: 'system', text: '规则' },
        { role: 'user', text: '问题' },
      ],
      temperature: 0.5,
      topP: 1,
      maxTokens: 4096,
    }, undefined);
  });

  it('fails closed when the prompt exceeds the foreground byte budget', async () => {
    const huge = '长'.repeat(40 * 1024);
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.report',
      messages: [textMessage('user', huge)],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-input-over-budget');
    }
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('fails closed on non-text message parts instead of dropping them', async () => {
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'data', data: { type: 'image-url', url: 'data:image/png;base64,x' } },
        ],
      }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-message-part-unsupported');
    }
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('fails closed on roles outside the product text contract', async () => {
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [
        textMessage('user', '问'),
        { role: 'assistant', content: [{ type: 'text' as const, text: '答' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-message-role-unsupported');
    }
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('fails closed when a vision surface is sent through the text-only helper', async () => {
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.profile.checkup-ocr',
      messages: [textMessage('user', '识别这张图')],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-surface-not-admitted');
    }
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('propagates typed runtime failures as bounded errors', async () => {
    executeMock.mockRejectedValue(Object.assign(new Error('denied'), {
      reasonCode: 'local-app-access-denied',
    }));

    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [textMessage('user', '问题')],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('local-app-access-denied');
    }
  });

  it('aborts before the call when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runParentosTextGenerate({
      surfaceId: 'parentos.advisor',
      messages: [textMessage('user', '问题')],
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('does not dispatch when cancellation happens while checking the configuration', async () => {
    const controller = new AbortController();
    let release!: () => void;
    requireCapabilityMock.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = runParentosTextGenerate({ surfaceId: 'parentos.advisor', messages: [textMessage('user', '问题')], signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('forwards a live AbortSignal to the protected execute operation and settles its cancellation', async () => {
    const controller = new AbortController();
    executeMock.mockImplementation((_spec, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = runParentosTextGenerate({ surfaceId: 'parentos.advisor', messages: [textMessage('user', '问题')], signal: controller.signal });
    await vi.waitFor(() => expect(executeMock).toHaveBeenCalledOnce());
    expect(executeMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('discards a result that arrives after cancellation even if a test carrier ignores the signal', async () => {
    const controller = new AbortController();
    let release!: (result: unknown) => void;
    executeMock.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = runParentosTextGenerate({ surfaceId: 'parentos.advisor', messages: [textMessage('user', '问题')], signal: controller.signal });
    await vi.waitFor(() => expect(executeMock).toHaveBeenCalledOnce());
    controller.abort();
    release({ output: { type: 'text-generate', items: [{ type: 'text', text: 'Late output' }], finishReason: 'stop' }, traceId: 'old-trace' });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('creates a typed surface-unavailable error', () => {
    const error = createParentosAISurfaceUnavailableError('parentos.journal.voice-observation');
    expect(error.reasonCode).toBe('parentos-ai-surface-not-admitted');
    expect(error.message).toContain('parentos.journal.voice-observation');
  });
});
