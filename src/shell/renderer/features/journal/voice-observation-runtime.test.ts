import { describe, expect, it } from 'vitest';
import { hasVoiceTranscriptionRuntime, transcribeVoiceObservation } from './voice-observation-runtime.js';

describe('voice observation runtime (STT not admitted by App Access)', () => {
  it('reports the transcription surface as unavailable', async () => {
    await expect(hasVoiceTranscriptionRuntime()).resolves.toBe(false);
  });

  it('fails closed with a typed surface-unavailable error', async () => {
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toMatchObject({
      reasonCode: 'parentos-ai-surface-not-admitted',
    });
  });

  it('still validates input before the gate', async () => {
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      mimeType: '  ',
    })).rejects.toThrow(/mimeType/);
    await expect(transcribeVoiceObservation({
      audioBlob: new Blob([], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
    })).rejects.toThrow(/audio bytes/);
  });
});
