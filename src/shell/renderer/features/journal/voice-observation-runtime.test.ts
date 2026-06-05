import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasVoiceTranscriptionRuntime, transcribeVoiceObservation } from './voice-observation-runtime.js';

const {
  hasParentOSNimiClientMock,
  runParentosSpeechTranscribeMock,
} = vi.hoisted(() => ({
  hasParentOSNimiClientMock: vi.fn(),
  runParentosSpeechTranscribeMock: vi.fn(),
}));

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  hasParentOSNimiClient: () => hasParentOSNimiClientMock(),
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosSpeechTranscribe: runParentosSpeechTranscribeMock,
}));

describe('voice observation runtime', () => {
  beforeEach(() => {
    hasParentOSNimiClientMock.mockReset();
    runParentosSpeechTranscribeMock.mockReset();
  });

  it('detects when the local transcription surface is available', async () => {
    hasParentOSNimiClientMock.mockReturnValue(true);

    await expect(hasVoiceTranscriptionRuntime()).resolves.toBe(true);
  });

  it('uses the typed local STT surface and returns transcript text', async () => {
    runParentosSpeechTranscribeMock.mockResolvedValue({
      text: '观察到他愿意轮流搭积木。',
      artifacts: [{ artifactId: 'artifact-1', mimeType: 'text/plain', displayName: 'transcript' }],
      trace: { traceId: 'trace-1', modelResolved: 'local-stt', routeDecision: 'local' },
    });

    const result = await transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    });

    expect(runParentosSpeechTranscribeMock).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'parentos.journal.voice-observation',
      mimeType: 'audio/webm',
      audioBytes: expect.any(Uint8Array),
      defaults: expect.objectContaining({
        language: 'zh-CN',
        responseFormat: 'text',
      }),
    }));
    expect(result.transcript).toBe('观察到他愿意轮流搭积木。');
    expect(result.trace.routeDecision).toBe('local');
  });

  it('rejects malformed typed outputs that contain no transcript text', async () => {
    runParentosSpeechTranscribeMock.mockResolvedValue({
      text: '   ',
      artifacts: [],
      trace: {},
    });

    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toThrow(/missing transcript text/);
  });
});
