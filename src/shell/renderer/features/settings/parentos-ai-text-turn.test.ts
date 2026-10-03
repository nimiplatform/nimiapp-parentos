import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NimiLocalAppTextTurnEvent } from '@nimiplatform/sdk/app';

const { streamTurnMock, requireCapabilityMock } = vi.hoisted(() => ({
  streamTurnMock: vi.fn(),
  requireCapabilityMock: vi.fn(async () => undefined),
}));

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => ({ ai: { text: { streamTurn: streamTurnMock } } }),
}));

vi.mock('./parentos-ai-config.js', () => ({
  requireParentosAIConfigCapability: requireCapabilityMock,
  PARENTOS_TEXT_CAPABILITY_CONTRACT: 'text.generate',
}));

import { runParentosTextTurn } from './parentos-ai-text-turn.js';

type Event = NimiLocalAppTextTurnEvent;

/** A subscription that yields the scripted events, optionally waiting on a gate first. */
function subscription(events: Event[], options: { gate?: Promise<void> } = {}) {
  const cancel = vi.fn(async () => undefined);
  let canceled = false;
  cancel.mockImplementation(async () => { canceled = true; });
  const iterable = {
    cancel,
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        if (options.gate) await options.gate;
        if (canceled) return;
        yield event;
      }
    },
  };
  return iterable;
}

const delta = (sequence: number, text: string, itemIndex = 0): Event => ({ type: 'delta', sequence: String(sequence), traceId: 't', text, itemIndex });
const completed = (sequence: number, finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls'): Event => ({ type: 'completed', sequence: String(sequence), traceId: 't', finishReason });

const baseInput = () => ({
  surfaceId: 'parentos.advisor' as const,
  messages: [
    { role: 'system' as const, text: 'rules' },
    { role: 'user' as const, text: '户外活动够了吗' },
    { role: 'assistant' as const, text: '上周记录了 120 分钟。' },
    { role: 'user' as const, text: '那和上次比呢' },
  ],
  budget: { maxMessageBytes: 16 * 1024, maxPromptBytes: 24 * 1024 },
  signal: new AbortController().signal,
});

describe('runParentosTextTurn', () => {
  beforeEach(() => {
    streamTurnMock.mockReset();
    requireCapabilityMock.mockReset();
    requireCapabilityMock.mockImplementation(async () => undefined);
  });

  it('sends real roles without tools and returns text only after completed/stop', async () => {
    streamTurnMock.mockResolvedValue(subscription([delta(1, '本周'), delta(2, '已记录 90 分钟。'), completed(3, 'stop')]));
    const result = await runParentosTextTurn(baseInput());
    expect(result).toEqual({ ok: true, text: '本周已记录 90 分钟。', traceId: 't' });
    const request = streamTurnMock.mock.calls[0]?.[0];
    expect(request.messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('toolChoice');
  });

  it.each([
    ['length', 'length'],
    ['content-filter', 'content-filter'],
    ['tool-calls', 'unexpected-output'],
  ] as const)('maps completed/%s to a typed failure without text', async (finishReason, kind) => {
    streamTurnMock.mockResolvedValue(subscription([delta(1, '部分回答'), completed(2, finishReason)]));
    const result = await runParentosTextTurn(baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe(kind);
  });

  it('treats a failed event, an empty completion and a missing terminal event as failures', async () => {
    streamTurnMock.mockResolvedValueOnce(subscription([
      delta(1, 'x'),
      { type: 'failed', sequence: '2', traceId: 't', reasonCode: 'runtime-model-unavailable', actionHint: '' },
    ]));
    const failed = await runParentosTextTurn(baseInput());
    expect(failed).toMatchObject({ ok: false, failure: { kind: 'failed', reasonCode: 'runtime-model-unavailable' } });

    streamTurnMock.mockResolvedValueOnce(subscription([delta(1, '   '), completed(2, 'stop')]));
    expect(await runParentosTextTurn(baseInput())).toMatchObject({ ok: false, failure: { kind: 'empty' } });

    streamTurnMock.mockResolvedValueOnce(subscription([delta(1, '半句')]));
    expect(await runParentosTextTurn(baseInput())).toMatchObject({ ok: false, failure: { kind: 'incomplete' } });
  });

  it('cancels and fails on an undeclared tool call', async () => {
    const sub = subscription([
      { type: 'tool-call', sequence: '1', traceId: 't', itemIndex: 0, toolCall: { id: 'c1', name: 'x', arguments: {} } } as Event,
      completed(2, 'stop'),
    ]);
    streamTurnMock.mockResolvedValue(sub);
    expect(await runParentosTextTurn(baseInput())).toMatchObject({ ok: false, failure: { kind: 'unexpected-output' } });
    expect(sub.cancel).toHaveBeenCalled();
  });

  it('cancels a subscription whose open resolves after the abort', async () => {
    const controller = new AbortController();
    const sub = subscription([delta(1, 'late'), completed(2, 'stop')]);
    let open!: (value: unknown) => void;
    streamTurnMock.mockReturnValue(new Promise((resolve) => { open = resolve; }));
    const pending = runParentosTextTurn({ ...baseInput(), signal: controller.signal });
    await vi.waitFor(() => expect(streamTurnMock).toHaveBeenCalled());
    controller.abort();
    open(sub);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(sub.cancel).toHaveBeenCalled();
  });

  it('cancels the live subscription when aborted mid-stream and never returns partial text', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sub = subscription([delta(1, 'unsafe partial'), completed(2, 'stop')], { gate });
    streamTurnMock.mockResolvedValue(sub);
    const pending = runParentosTextTurn({ ...baseInput(), signal: controller.signal });
    await vi.waitFor(() => expect(streamTurnMock).toHaveBeenCalled());
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(sub.cancel).toHaveBeenCalled();
  });

  it('refuses a missing text intent as ai-unavailable before opening a stream', async () => {
    requireCapabilityMock.mockRejectedValue(Object.assign(new Error('missing'), { reasonCode: 'parentos-ai-capability-not-configured' }));
    const result = await runParentosTextTurn(baseInput());
    expect(result).toMatchObject({ ok: false, failure: { kind: 'ai-unavailable', reasonCode: 'parentos-ai-capability-not-configured' } });
    expect(streamTurnMock).not.toHaveBeenCalled();
  });

  it('admits only conversation surfaces to the text turn', async () => {
    const result = await runParentosTextTurn({ ...baseInput(), surfaceId: 'parentos.report' });
    expect(result).toMatchObject({ ok: false, failure: { kind: 'ai-unavailable', reasonCode: 'parentos-ai-surface-not-admitted' } });
    expect(requireCapabilityMock).not.toHaveBeenCalled();
    expect(streamTurnMock).not.toHaveBeenCalled();
  });

  it('rejects input over the per-call budget before opening a stream', async () => {
    const result = await runParentosTextTurn({ ...baseInput(), budget: { maxMessageBytes: 8, maxPromptBytes: 64 } });
    expect(result).toMatchObject({ ok: false, failure: { kind: 'input-over-budget' } });
    expect(streamTurnMock).not.toHaveBeenCalled();
  });
});
