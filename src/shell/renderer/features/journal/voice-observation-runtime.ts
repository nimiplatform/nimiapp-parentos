import {
  runParentosSpeechTranscribe,
} from '../settings/parentos-ai-runtime.js';
import { hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';

export interface VoiceObservationTranscription {
  transcript: string;
  artifacts: Array<{ artifactId?: string; mimeType?: string; displayName?: string }>;
  trace: {
    traceId?: string;
    modelResolved?: string;
    routeDecision?: string;
  };
}

function toArtifactMetadata(
  artifacts: ReadonlyArray<{ artifactId?: string; mimeType?: string; displayName?: string }> | undefined,
) {
  return Array.isArray(artifacts) ? artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    mimeType: artifact.mimeType,
    displayName: artifact.displayName,
  })) : [];
}

export async function hasVoiceTranscriptionRuntime() {
  return hasParentOSNimiClient();
}

export async function transcribeVoiceObservation(input: {
  audioBlob: Blob;
  mimeType: string;
}): Promise<VoiceObservationTranscription> {
  const mimeType = input.mimeType.trim();
  if (!mimeType) {
    throw new Error('voice observation transcription requires a mimeType');
  }

  const audioBytes = new Uint8Array(await input.audioBlob.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new Error('voice observation transcription requires audio bytes');
  }

  const output = await runParentosSpeechTranscribe({
    surfaceId: 'parentos.journal.voice-observation',
    audioBytes,
    mimeType,
    defaults: {
      language: 'zh-CN',
      responseFormat: 'text',
    },
  });

  const transcript = output.text.trim();
  if (!transcript) {
    throw new Error('runtime speechTranscribe output is missing transcript text');
  }

  return {
    transcript,
    artifacts: toArtifactMetadata(output.artifacts),
    trace: {
      traceId: output.trace.traceId,
      modelResolved: output.trace.modelResolved,
      routeDecision: output.trace.routeDecision,
    },
  };
}
