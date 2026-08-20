import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScenarioClientMock,
  getParentOSNimiClientMock,
  hasCapabilityMock,
  requireCapabilityMock,
  runRuntimeSpeechTranscribeMock,
} = vi.hoisted(() => ({
  createScenarioClientMock: vi.fn(() => ({ scenario: 'adapter' })),
  getParentOSNimiClientMock: vi.fn(() => ({ ai: { scenarioJobs: {}, artifacts: {} } })),
  hasCapabilityMock: vi.fn(),
  requireCapabilityMock: vi.fn(),
  runRuntimeSpeechTranscribeMock: vi.fn(),
}));

vi.mock('@nimiplatform/sdk/app', () => ({
  createNimiLocalAppRuntimeScenarioJobClient: createScenarioClientMock,
}));

vi.mock('@nimiplatform/kit/features/generation/runtime', () => ({
  runRuntimeSpeechTranscribe: runRuntimeSpeechTranscribeMock,
}));

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: getParentOSNimiClientMock,
}));

vi.mock('../settings/parentos-ai-config.js', () => ({
  hasParentosAIConfigCapability: hasCapabilityMock,
  PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT: 'audio.transcribe',
  requireParentosAIConfigCapability: requireCapabilityMock,
}));

import { hasVoiceTranscriptionRuntime, transcribeVoiceObservation } from './voice-observation-runtime.js';

describe('voice observation runtime (Nimi App Access Scenario Job STT)', () => {
  beforeEach(() => {
    createScenarioClientMock.mockClear();
    getParentOSNimiClientMock.mockClear();
    hasCapabilityMock.mockReset().mockResolvedValue(true);
    requireCapabilityMock.mockReset().mockResolvedValue(undefined);
    runRuntimeSpeechTranscribeMock.mockReset().mockResolvedValue({
      ok: true,
      output: { text: '孩子今天专注地搭积木。' },
      trace: { traceId: 'trace-stt-1', modelResolved: 'local-stt' },
    });
  });

  it('reports availability only when audio.transcribe is configured', async () => {
    await expect(hasVoiceTranscriptionRuntime()).resolves.toBe(true);
    hasCapabilityMock.mockResolvedValue(false);
    await expect(hasVoiceTranscriptionRuntime()).resolves.toBe(false);
  });

  it('transcribes through the protected Local App Scenario Job adapter', async () => {
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).resolves.toMatchObject({
      transcript: '孩子今天专注地搭积木。',
      artifacts: [],
      trace: { traceId: 'trace-stt-1' },
    });

    expect(createScenarioClientMock).toHaveBeenCalledTimes(1);
    expect(runRuntimeSpeechTranscribeMock).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'nimi.parentos',
      surfaceId: 'parentos.journal.voice-observation',
      audio: expect.objectContaining({ type: 'bytes', mimeType: 'audio/webm' }),
    }));
  });

  it('fails closed when the owner intent is missing or Runtime returns no transcript', async () => {
    requireCapabilityMock.mockRejectedValueOnce(Object.assign(new Error('missing'), {
      reasonCode: 'parentos-ai-capability-not-configured',
    }));
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toMatchObject({ reasonCode: 'parentos-ai-capability-not-configured' });

    runRuntimeSpeechTranscribeMock.mockResolvedValue({
      ok: true,
      output: { text: '   ' },
    });
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toMatchObject({ reasonCode: 'parentos-ai-transcript-invalid' });
  });

  it('preserves a typed AIConfig access failure before Scenario Job dispatch', async () => {
    requireCapabilityMock.mockRejectedValue(Object.assign(new Error('denied'), {
      reasonCode: 'local-app-access-denied',
    }));

    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toMatchObject({ reasonCode: 'local-app-access-denied' });
    expect(runRuntimeSpeechTranscribeMock).not.toHaveBeenCalled();
  });

  it('validates input before dispatch', async () => {
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: '  ',
    })).rejects.toThrow(/mimeType/);
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob([], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toThrow(/audio bytes/);
    expect(runRuntimeSpeechTranscribeMock).not.toHaveBeenCalled();
  });
});
