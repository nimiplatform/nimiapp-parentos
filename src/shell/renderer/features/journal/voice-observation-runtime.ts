import {
  createParentosAISurfaceUnavailableError,
} from '../settings/parentos-ai-runtime.js';
import { isParentosAISurfaceExecutable } from '../settings/parentos-ai-surface-policy.js';

export interface VoiceObservationTranscription {
  transcript: string;
  artifacts: Array<{ artifactId?: string; mimeType?: string; displayName?: string }>;
  trace: {
    traceId?: string;
    modelResolved?: string;
    routeDecision?: string;
  };
}

// Speech transcription has no admitted Nimi App Access operation (the unary
// text surface carries no audio channel). Recording and playback stay fully
// local; only the transcribe action is gated off as a typed product gap.
export async function hasVoiceTranscriptionRuntime() {
  return isParentosAISurfaceExecutable('parentos.journal.voice-observation');
}

export async function transcribeVoiceObservation(input: {
  audioBlob: Blob;
  mimeType: string;
}): Promise<VoiceObservationTranscription> {
  const mimeType = input.mimeType.trim();
  if (!mimeType) {
    throw new Error('voice observation transcription requires a mimeType');
  }
  if (input.audioBlob.size === 0) {
    throw new Error('voice observation transcription requires audio bytes');
  }
  throw createParentosAISurfaceUnavailableError('parentos.journal.voice-observation');
}
