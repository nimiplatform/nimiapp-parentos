import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateCandidateMock = vi.fn();

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => ({
    ai: { text: { generateCandidate: generateCandidateMock } },
  }),
}));

import {
  createParentosAISurfaceUnavailableError,
  runParentosTextGenerate,
} from './parentos-ai-runtime.js';

function textMessage(role: 'system' | 'user', text: string) {
  return { role, content: [{ type: 'text' as const, text }] };
}

describe('runParentosTextGenerate (unary text-candidate contract)', () => {
  beforeEach(() => {
    generateCandidateMock.mockReset().mockResolvedValue({
      text: '观察到孩子在持续积累。',
      finishReason: 'stop',
      traceId: 'trace-1',
    });
  });

  it('maps system+user messages onto the candidate contract with clamped defaults', async () => {
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
    expect(generateCandidateMock).toHaveBeenCalledWith({
      messages: [
        { role: 'system', text: '规则' },
        { role: 'user', text: '问题' },
      ],
      temperature: 0.5,
      topP: 1,
      maxTokens: 4096,
    });
  });

  it('fails closed when the prompt exceeds the unary byte budget', async () => {
    const huge = '长'.repeat(40 * 1024);
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.report',
      messages: [textMessage('user', huge)],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-input-over-budget');
    }
    expect(generateCandidateMock).not.toHaveBeenCalled();
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
    expect(generateCandidateMock).not.toHaveBeenCalled();
  });

  it('fails closed on roles the unary contract cannot represent', async () => {
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
    expect(generateCandidateMock).not.toHaveBeenCalled();
  });

  it('fails closed on surfaces without an admitted operation (vision/STT gap)', async () => {
    const result = await runParentosTextGenerate({
      surfaceId: 'parentos.profile.checkup-ocr',
      messages: [textMessage('user', '识别这张图')],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('parentos-ai-surface-not-admitted');
    }
    expect(generateCandidateMock).not.toHaveBeenCalled();
  });

  it('propagates typed runtime failures as bounded errors', async () => {
    generateCandidateMock.mockRejectedValue(Object.assign(new Error('denied'), {
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
    expect(generateCandidateMock).not.toHaveBeenCalled();
  });

  it('creates a typed surface-unavailable error', () => {
    const error = createParentosAISurfaceUnavailableError('parentos.journal.voice-observation');
    expect(error.reasonCode).toBe('parentos-ai-surface-not-admitted');
    expect(error.message).toContain('parentos.journal.voice-observation');
  });
});
