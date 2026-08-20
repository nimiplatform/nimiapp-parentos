import { runRuntimeSpeechTranscribe } from '@nimiplatform/kit/features/generation/runtime';
import { createNimiLocalAppRuntimeScenarioJobClient } from '@nimiplatform/sdk/app';
import { ulid } from '../../bridge/ulid.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import {
  hasParentosAIConfigCapability,
  PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT,
} from '../settings/parentos-ai-config.js';
import { isParentosAISurfaceExecutable } from '../settings/parentos-ai-surface-policy.js';

const PARENTOS_APP_ID = 'nimi.parentos';
const MAX_TRANSCRIPTION_AUDIO_BYTES = 32 * 1024 * 1024;

export interface VoiceObservationTranscription {
  transcript: string;
  artifacts: Array<{ artifactId?: string; mimeType?: string; displayName?: string }>;
  trace: {
    traceId?: string;
    modelResolved?: string;
    routeDecision?: string;
  };
}

export async function hasVoiceTranscriptionRuntime(): Promise<boolean> {
  return isParentosAISurfaceExecutable('parentos.journal.voice-observation')
    && hasParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT);
}

// @nimi-authority: rule.parentos.jour.r006
// @nimi-authority: rule.parentos.jour.r007
// @nimi-authority: rule.parentos.jour.r008
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
  if (input.audioBlob.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new Error('voice observation transcription exceeds the Nimi App Access audio bound');
  }
  if (!await hasVoiceTranscriptionRuntime()) {
    throw Object.assign(
      new Error('ParentOS voice transcription requires a Nimi-owned audio.transcribe AIConfig intent.'),
      { reasonCode: 'parentos-ai-capability-not-configured' },
    );
  }

  const audio = new Uint8Array(await input.audioBlob.arrayBuffer());
  const result = await runRuntimeSpeechTranscribe({
    runtime: {
      ai: createNimiLocalAppRuntimeScenarioJobClient(getParentOSNimiClient().ai),
    },
    appId: PARENTOS_APP_ID,
    audio: { type: 'bytes', bytes: audio, mimeType },
    scenarioId: `parentos-journal-voice-${ulid()}`,
    surfaceId: 'parentos.journal.voice-observation',
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.message), {
      reasonCode: result.error.reasonCode || result.error.code,
      cause: result.error,
    });
  }

  const transcript = result.output.text.trim();
  if (!transcript) {
    throw Object.assign(new Error('Nimi speech transcription returned no stable transcript text.'), {
      reasonCode: 'parentos-ai-transcript-invalid',
    });
  }
  return {
    transcript,
    artifacts: [],
    trace: result.trace ?? {},
  };
}
