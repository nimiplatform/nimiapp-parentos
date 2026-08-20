/**
 * check-parentos-ai-boundary.ts
 * Validates AI safety boundaries:
 * - banned wording stays out of executable source contexts
 * - reports runtime use is allowed only on the admitted report narration surface
 * - journal AI tagging stays on local closed-set extraction
 * - voice STT stays on the typed local transcription surface
 * - profile AI surfaces stay inside the admitted local summary / OCR boundaries
 * - advisor chat retains prompt-strategy selection, local runtime use, and structured fallback markers
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { readKnowledgeAssetData } from './knowledge-json-asset.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TABLES = resolve(ROOT, 'data/structured/parentos');
const DATA_KNOWLEDGE = resolve(ROOT, 'data/knowledge');
const SRC = resolve(ROOT, 'src/shell/renderer');

function loadBannedWordsFromAuthority() {
  const data = readKnowledgeAssetData(DATA_KNOWLEDGE, 'ai-boundary-rules') as {
    bannedTermRules?: Array<{ label?: string }>;
  };
  const words = (data.bannedTermRules ?? [])
    .map((rule) => rule.label)
    .filter((label): label is string => Boolean(label));
  if (words.length === 0) {
    throw new Error('ai-boundary-rules data asset must declare bannedTermRules labels');
  }
  return words;
}

const BANNED_WORDS = loadBannedWordsFromAuthority();

export interface SourceFile {
  path: string;
  content: string;
}

function relativeToRoot(path: string, rootPath: string) {
  return relative(rootPath, path).replaceAll('\\', '/');
}

function fileHasRuntimeCall(content: string) {
  return hasTextRuntimePath(content) || hasSpeechRuntimePath(content);
}

function hasTextRuntimePath(content: string) {
  return content.includes('runtime.ai.text.generate')
    || content.includes('runtime.ai.text.stream')
    || content.includes('ai.text.generateCandidate')
    || content.includes('runParentosTextGenerate');
}

function hasSpeechRuntimePath(content: string) {
  return content.includes('media.stt.transcribe')
    || content.includes('audio.transcribe');
}

function hasSurfaceMarker(content: string, surfaceId: string) {
  return content.includes(`surfaceId: '${surfaceId}'`)
    || content.includes(`surfaceId: "${surfaceId}"`)
    || content.includes(`buildParentosRuntimeMetadata('${surfaceId}')`)
    || content.includes(`buildParentosRuntimeMetadata("${surfaceId}")`)
    || content.includes(`buildParentosRuntimeMetadata(\`${surfaceId}\`)`);
}

function hasImageInputMarker(content: string) {
  return content.includes("type: 'image-url'")
    || content.includes('type: "image-url"')
    || content.includes("type: 'image_url'")
    || content.includes('type: "image_url"');
}

export function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'gen' && entry.name !== 'node_modules') {
        files.push(...collectTsFiles(full));
      } else if (
        entry.isFile()
        && /\.(ts|tsx)$/.test(entry.name)
        && !entry.name.endsWith('.gen.ts')
        && !entry.name.endsWith('.test.ts')
        && !entry.name.endsWith('.test.tsx')
      ) {
        files.push(full);
      }
    }
  } catch {
    return files;
  }
  return files;
}

export function findUnexpectedRuntimeFileErrors(input: {
  files: SourceFile[];
  rootPath: string;
  admittedRuntimeFiles: string[];
  label: string;
}) {
  const errors: string[] = [];
  const admittedRuntimeFiles = new Set(input.admittedRuntimeFiles);

  for (const file of input.files) {
    if (!fileHasRuntimeCall(file.content)) continue;
    const relPath = relativeToRoot(file.path, input.rootPath);
    if (!admittedRuntimeFiles.has(relPath)) {
      errors.push(`Unexpected ${input.label} AI runtime use in ${relPath}`);
    }
  }

  return errors;
}

export function collectBannedWordViolations(files: SourceFile[], rootPath: string) {
  const errors: string[] = [];

  for (const file of files) {
    const relPath = relativeToRoot(file.path, rootPath);
    const isSafetyFilterSource =
      relPath.endsWith('src/shell/renderer/engine/ai-safety-filter.ts')
      || relPath.endsWith('src\\shell\\renderer\\engine\\ai-safety-filter.ts');

    for (const word of BANNED_WORDS) {
      const lines = file.content.split('\n');
      let inTemplateLiteral = false;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const backtickCount = (line.match(/`/g) ?? []).length;
        if (backtickCount % 2 === 1) inTemplateLiteral = !inTemplateLiteral;

        if (!line.includes(word) || isSafetyFilterSource) continue;

        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (inTemplateLiteral) continue;
        const executableSlice = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
        if (!executableSlice.includes(word)) continue;
        if (trimmed.includes('不得出现') || trimmed.includes('禁止') || trimmed.includes('BANNED')) continue;

        errors.push(`Banned word '${word}' found in ${relPath}:${index + 1} (non-string, non-comment context)`);
      }
    }
  }

  return errors;
}

export function findReportsBoundaryErrors(input: {
  routesSource: string;
  reportFiles: SourceFile[];
}) {
  const errors: string[] = [];

  if (!input.routesSource.includes('path="/reports"')) {
    errors.push('/reports route is missing from routes.tsx');
  }

  for (const file of input.reportFiles) {
    const usesRuntime = hasTextRuntimePath(file.content);
    if (!usesRuntime) continue;

    if (!hasSurfaceMarker(file.content, 'parentos.report')) {
      errors.push(`${file.path} uses report runtime without the parentos.report surface marker`);
    }

    if (!file.content.includes('filterAIResponse')) {
      errors.push(`${file.path} uses report runtime without AI safety filtering`);
    }

    if (!file.content.includes('runParentosTextGenerate')) {
      errors.push(`${file.path} must use the governed ParentOS text runtime helper`);
    }
  }

  return errors;
}

export function findJournalBoundaryErrors(journalAiSource: string) {
  const errors: string[] = [];

  if (!hasTextRuntimePath(journalAiSource)) {
    errors.push('journal AI tagging is missing governed text.generate extraction path');
  }

  if (journalAiSource.includes('runtime.ai.text.stream')) {
    errors.push('journal AI tagging must stay on closed-set extraction only');
  }

  if (!journalAiSource.includes('runParentosTextGenerate')) {
    errors.push('journal AI tagging must dispatch through the governed ParentOS text runtime helper');
  }

  if (!hasSurfaceMarker(journalAiSource, 'parentos.journal.ai-tagging')) {
    errors.push('journal AI tagging is missing the parentos.journal.ai-tagging surface marker');
  }

  for (const marker of [
    'unknown dimensionId',
    'unsupported tag',
    'response is missing tags',
  ]) {
    if (!journalAiSource.includes(marker)) {
      errors.push(`journal AI tagging is missing fail-close marker: ${marker}`);
    }
  }

  return errors;
}

export function findVoiceBoundaryErrors(voiceObservationSource: string) {
  const errors: string[] = [];

  // Voice transcription must use the public protected Local App Scenario Job
  // adapter, require the exact owner-managed audio intent, and reject an empty
  // transcript instead of fabricating success.
  for (const marker of [
    'runRuntimeSpeechTranscribe',
    'createNimiLocalAppRuntimeScenarioJobClient',
    'requireParentosAIConfigCapability',
    'PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT',
    'if (!transcript)',
  ]) {
    if (!voiceObservationSource.includes(marker)) {
      errors.push(`voice observation runtime is missing boundary marker: ${marker}`);
    }
  }

  if (!voiceObservationSource.includes('parentos.journal.voice-observation')) {
    errors.push('voice observation runtime is missing the parentos.journal.voice-observation surface marker');
  }

  return errors;
}

export function findProfileBoundaryErrors(input: {
  profileFiles: SourceFile[];
  rootPath: string;
}) {
  const errors = findUnexpectedRuntimeFileErrors({
    files: input.profileFiles,
    rootPath: input.rootPath,
    admittedRuntimeFiles: [
      'src/shell/renderer/features/profile/ai-summary-card.tsx',
      'src/shell/renderer/features/profile/checkup-ocr.ts',
      'src/shell/renderer/features/profile/dental-eruption-scan.ts',
      'src/shell/renderer/features/profile/medical-events-page-insights.ts',
      'src/shell/renderer/features/profile/medical-events-page-form-state.ts',
    ],
    label: 'profile',
  });

  const relFiles = new Map(
    input.profileFiles.map((file) => [relativeToRoot(file.path, input.rootPath), file]),
  );

  const summaryFile = relFiles.get('src/shell/renderer/features/profile/ai-summary-card.tsx');
  if (summaryFile && hasTextRuntimePath(summaryFile.content)) {
    if (!summaryFile.content.includes('parentos.profile.summary.')) {
      errors.push('ai-summary-card.tsx is missing the parentos.profile.summary.* surface marker');
    }
    if (!summaryFile.content.includes('runParentosTextGenerate')) {
      errors.push('ai-summary-card.tsx must use the governed ParentOS text runtime helper');
    }
    if (!summaryFile.content.includes('filterAIResponse')) {
      errors.push('ai-summary-card.tsx uses runtime summaries without AI safety filtering');
    }
    if (!summaryFile.content.includes('dataContext')) {
      errors.push('ai-summary-card.tsx must build summaries from current local page dataContext only');
    }
  }

  const checkupOcrFile = relFiles.get('src/shell/renderer/features/profile/checkup-ocr.ts');
  if (checkupOcrFile && hasTextRuntimePath(checkupOcrFile.content)) {
    if (!hasSurfaceMarker(checkupOcrFile.content, 'parentos.profile.checkup-ocr')) {
      errors.push('checkup-ocr.ts is missing the parentos.profile.checkup-ocr surface marker');
    }
    if (
      !checkupOcrFile.content.includes('runParentosTextGenerate')
      && !checkupOcrFile.content.includes('runParentosMultimodalTextGenerate')
    ) {
      errors.push('checkup-ocr.ts must use governed ParentOS runtime helpers');
    }
    if (!hasImageInputMarker(checkupOcrFile.content)) {
      errors.push('checkup-ocr.ts must keep image OCR on the explicit image_url input path');
    }
    if (!checkupOcrFile.content.includes('parseOCRMeasurementExtraction')) {
      errors.push('checkup-ocr.ts must fail closed through the typed OCR extraction parser');
    }
  }

  const dentalEruptionScanFile = relFiles.get('src/shell/renderer/features/profile/dental-eruption-scan.ts');
  if (dentalEruptionScanFile && hasTextRuntimePath(dentalEruptionScanFile.content)) {
    if (!hasSurfaceMarker(dentalEruptionScanFile.content, 'parentos.profile.dental-eruption-scan')) {
      errors.push('dental-eruption-scan.ts is missing the parentos.profile.dental-eruption-scan surface marker');
    }
    if (
      !dentalEruptionScanFile.content.includes('runParentosTextGenerate')
      && !dentalEruptionScanFile.content.includes('runParentosMultimodalTextGenerate')
    ) {
      errors.push('dental-eruption-scan.ts must use governed ParentOS runtime helpers');
    }
    if (!hasImageInputMarker(dentalEruptionScanFile.content)) {
      errors.push('dental-eruption-scan.ts must keep image extraction on the explicit image_url input path');
    }
    if (!dentalEruptionScanFile.content.includes('parseDentalEruptionExtraction')) {
      errors.push('dental-eruption-scan.ts must fail closed through the typed dental extraction parser');
    }
  }

  const medicalInsightsFile = relFiles.get('src/shell/renderer/features/profile/medical-events-page-insights.ts');
  if (medicalInsightsFile && hasTextRuntimePath(medicalInsightsFile.content)) {
    for (const surfaceId of [
      'parentos.medical.smart-insight',
      'parentos.medical.event-analysis',
    ]) {
      if (!hasSurfaceMarker(medicalInsightsFile.content, surfaceId)) {
        errors.push(`medical-events-page-insights.ts is missing the ${surfaceId} surface marker`);
      }
    }
    if (!medicalInsightsFile.content.includes('runParentosTextGenerate')) {
      errors.push('medical-events-page-insights.ts must use the governed ParentOS text runtime helper');
    }
    if (!medicalInsightsFile.content.includes('filterAIResponse')) {
      errors.push('medical-events-page-insights.ts uses medical AI summaries without AI safety filtering');
    }
  }

  const medicalFormStateFile = relFiles.get('src/shell/renderer/features/profile/medical-events-page-form-state.ts');
  if (medicalFormStateFile && hasTextRuntimePath(medicalFormStateFile.content)) {
    if (!hasSurfaceMarker(medicalFormStateFile.content, 'parentos.medical.ocr-intake')) {
      errors.push('medical-events-page-form-state.ts is missing the parentos.medical.ocr-intake surface marker');
    }
    if (!medicalFormStateFile.content.includes('runParentosMultimodalTextGenerate')) {
      errors.push('medical-events-page-form-state.ts must use the governed ParentOS multimodal runtime helper');
    }
    if (!hasImageInputMarker(medicalFormStateFile.content)) {
      errors.push('medical-events-page-form-state.ts OCR intake must keep explicit image_url input');
    }
    if (!medicalFormStateFile.content.includes('JSON.parse')) {
      errors.push('medical-events-page-form-state.ts OCR intake must parse structured JSON output before prefilling');
    }
  }

  return errors;
}

export function findAdvisorBoundaryErrors(input: {
  advisorPageSource: string;
  advisorBoundarySource: string;
}) {
  const errors: string[] = [];

  for (const marker of [
    'REVIEWED_DOMAINS',
    'NEEDS_REVIEW_DOMAINS',
    'filterAIResponse',
    'inferRequestedDomains',
    'resolveAdvisorPromptStrategy',
    'buildAdvisorSnapshot',
    'serializeAdvisorSnapshot',
    'buildAdvisorRuntimeUserMessage',
    'buildAdvisorNeedsReviewRuntimeUserMessage',
    'buildAdvisorUnknownClarifierRuntimeUserMessage',
    'buildAdvisorGenericRuntimeUserMessage',
    'buildStructuredAdvisorFallback',
    'appendAdvisorSources',
  ]) {
    if (!input.advisorPageSource.includes(marker)) {
      errors.push(`advisor-page.tsx is missing AI boundary marker: ${marker}`);
    }
  }

  const hasReviewedDomainRuntimePath = hasTextRuntimePath(input.advisorPageSource);

  if (!hasReviewedDomainRuntimePath) {
    errors.push('advisor-page.tsx is missing reviewed-domain runtime generation path');
  }

  for (const marker of [
    "surfaceId: 'parentos.advisor'",
    'contextSnapshot: snapshotJson',
    'buildAdvisorRuntimeInput(',
    'shouldAppendAdvisorSources(',
    '运行时响应触发了安全过滤',
  ]) {
    if (!input.advisorPageSource.includes(marker)) {
      errors.push(`advisor-page.tsx is missing fail-close advisor marker: ${marker}`);
    }
  }

  for (const marker of [
    "export type AdvisorPromptStrategy",
    "return 'generic-chat';",
    "return 'unknown-clarifier';",
    "return 'reviewed-advice';",
    "return 'needs-review-descriptive';",
  ]) {
    if (!input.advisorBoundarySource.includes(marker)) {
      errors.push(`advisor-boundary.ts is missing advisor prompt-strategy marker: ${marker}`);
    }
  }

  return errors;
}

export function findRuntimeHelperBoundaryErrors(parentosAiRuntimeSource: string) {
  const errors: string[] = [];

  for (const marker of [
    'export async function runParentosTextGenerate',
    'getParentOSNimiClient().ai.text.generateCandidate({',
    'isParentosAISurfaceExecutable(input.surfaceId)',
    'requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)',
    'export function createParentosAISurfaceUnavailableError',
    'MAX_CANDIDATE_MESSAGES',
    'MAX_CANDIDATE_MESSAGE_BYTES',
    'MAX_CANDIDATE_PROMPT_BYTES',
    'MAX_CANDIDATE_TOKENS',
    'parentos-ai-input-over-budget',
    'parentos-ai-message-role-unsupported',
  ]) {
    if (!parentosAiRuntimeSource.includes(marker)) {
      errors.push(`parentos-ai-runtime.ts is missing governed helper marker: ${marker}`);
    }
  }

  // Legacy first-party execution surfaces and custody material remain
  // forbidden in the governed foreground text helper. Current protected App
  // Access Scenario Jobs are consumed only by their typed feature modules.
  for (const forbidden of [
    'streamParentosTextGenerate',
    'runParentosMultimodalTextGenerate',
    'runParentosSpeechTranscribe',
    'streamNimiTextResponse',
    'executeScenario',
    'createNimiRuntimeAIModel',
    'runNimiTextGenerate({',
    'SPEECH_TRANSCRIBE',
    'profileBindingId',
    'readinessRef',
    'connectorId',
    'runtime.ready()',
  ]) {
    if (parentosAiRuntimeSource.includes(forbidden)) {
      errors.push(`parentos-ai-runtime.ts must not retain legacy runtime surface: ${forbidden}`);
    }
  }

  return errors;
}

export function findSettingsPrivacyErrors(input: {
  settingsPageSource: string;
  aiSettingsSurfaceSources: SourceFile[];
  aiConfigSource: string;
}) {
  const errors: string[] = [];

  if (input.settingsPageSource.includes('不上传至云端')) {
    const disallowedMarkers = [
      "value: 'cloud'",
      'Connector ID',
      'route、model 和 connector',
    ];
    for (const file of input.aiSettingsSurfaceSources) {
      for (const disallowedMarker of disallowedMarkers) {
        if (file.content.includes(disallowedMarker)) {
          errors.push(
            `AI settings must stay local-only while privacy copy says no cloud upload (${disallowedMarker} in ${file.path})`,
          );
        }
      }
    }
  }

  if (!input.aiConfigSource.includes("PARENTOS_TEXT_CAPABILITY_CONTRACT = 'text.generate'")
    && !input.aiConfigSource.includes("capabilityContract: 'text.generate'")) {
    errors.push('ParentOS AI config must recognize the portable text.generate capability intent');
  }

  if (input.aiConfigSource.includes('.aiConfig.overwrite(')) {
    errors.push('ParentOS AI config must remain a read-only platform projection');
  }

  for (const custody of ['connectorId', 'connectorGrantId', 'profileBindingId', 'readinessRef', 'ownerId']) {
    if (input.aiConfigSource.includes(custody)) {
      errors.push(`ParentOS AI config must not carry custody material: ${custody}`);
    }
  }

  return errors;
}

function pass(message: string) {
  console.log(`  PASS: ${message}`);
}

function fail(message: string) {
  console.error(`  FAIL: ${message}`);
}

export function runAiBoundaryCheck() {
  const scanDirs = [
    resolve(SRC, 'engine'),
    resolve(SRC, 'features/advisor'),
    resolve(SRC, 'features/reports'),
    resolve(SRC, 'features/journal'),
    resolve(SRC, 'features/profile'),
  ];

  const scannedFiles = scanDirs.flatMap((dir) => collectTsFiles(dir))
    .map((path) => ({ path, content: readFileSync(path, 'utf-8') }));

  const bannedWordErrors = collectBannedWordViolations(scannedFiles, ROOT);

  const advisorFiles = collectTsFiles(resolve(SRC, 'features/advisor'))
    .map((path) => ({ path, content: readFileSync(path, 'utf-8') }));

  const reportFiles = collectTsFiles(resolve(SRC, 'features/reports'))
    .map((path) => ({ path, content: readFileSync(path, 'utf-8') }));

  const journalFiles = collectTsFiles(resolve(SRC, 'features/journal'))
    .map((path) => ({ path, content: readFileSync(path, 'utf-8') }));

  const profileFiles = collectTsFiles(resolve(SRC, 'features/profile'))
    .map((path) => ({ path, content: readFileSync(path, 'utf-8') }));

  const reportErrors = [
    ...findUnexpectedRuntimeFileErrors({
      files: reportFiles,
      rootPath: ROOT,
      admittedRuntimeFiles: [
        'src/shell/renderer/features/reports/narrative-prompt.ts',
      ],
      label: 'reports',
    }),
    ...findReportsBoundaryErrors({
      routesSource: readFileSync(resolve(SRC, 'app-shell/routes.tsx'), 'utf-8'),
      reportFiles,
    }),
  ];

  const journalErrors = [
    ...findUnexpectedRuntimeFileErrors({
      files: journalFiles,
      rootPath: ROOT,
      admittedRuntimeFiles: [
        'src/shell/renderer/features/journal/ai-journal-tagging.ts',
        'src/shell/renderer/features/journal/voice-observation-runtime.ts',
      ],
      label: 'journal',
    }),
    ...findJournalBoundaryErrors(
      readFileSync(resolve(SRC, 'features/journal/ai-journal-tagging.ts'), 'utf-8'),
    ),
  ];

  const voiceErrors = findVoiceBoundaryErrors(
    readFileSync(resolve(SRC, 'features/journal/voice-observation-runtime.ts'), 'utf-8'),
  );

  const advisorErrors = [
    ...findUnexpectedRuntimeFileErrors({
      files: advisorFiles,
      rootPath: ROOT,
      admittedRuntimeFiles: [
        'src/shell/renderer/features/advisor/advisor-page.tsx',
        'src/shell/renderer/features/advisor/advisor-suggestion-engine.ts',
      ],
      label: 'advisor',
    }),
    ...findAdvisorBoundaryErrors({
      advisorPageSource: readFileSync(resolve(SRC, 'features/advisor/advisor-page.tsx'), 'utf-8'),
      advisorBoundarySource: readFileSync(resolve(SRC, 'features/advisor/advisor-boundary.ts'), 'utf-8'),
    }),
  ];

  const profileErrors = findProfileBoundaryErrors({
    profileFiles,
    rootPath: ROOT,
  });

  const runtimeHelperErrors = findRuntimeHelperBoundaryErrors(
    readFileSync(resolve(SRC, 'features/settings/parentos-ai-runtime.ts'), 'utf-8'),
  );

  const aiSettingsSurfacePaths = [
    resolve(SRC, 'features/settings/ai-settings-page.tsx'),
    resolve(SRC, 'features/settings/parentos-ai-config.ts'),
  ];
  const aiSettingsSurfaceSources: SourceFile[] = aiSettingsSurfacePaths.map((path) => ({
    path: relativeToRoot(path, ROOT),
    content: readFileSync(path, 'utf-8'),
  }));

  const settingsErrors = findSettingsPrivacyErrors({
    settingsPageSource: readFileSync(resolve(SRC, 'features/settings/settings-page.tsx'), 'utf-8'),
    aiSettingsSurfaceSources,
    aiConfigSource: readFileSync(resolve(SRC, 'features/settings/parentos-ai-config.ts'), 'utf-8'),
  });

  const ksData = parseYaml(
    readFileSync(resolve(TABLES, 'knowledge-source-readiness.yaml'), 'utf-8'),
  ) as { sources: Array<{ domain: string; status: string }> };

  const needsReview = ksData.sources.filter((source) => source.status === 'needs-review').map((source) => source.domain);
  const reviewed = ksData.sources.filter((source) => source.status === 'reviewed').map((source) => source.domain);

  let knowledgeSourceError: string | null = null;
  try {
    const generatedReadiness = readFileSync(
      resolve(SRC, 'knowledge-base/gen/knowledge-source-readiness.gen.ts'),
      'utf-8',
    );
    if (!generatedReadiness.includes('NEEDS_REVIEW_DOMAINS') || !generatedReadiness.includes('REVIEWED_DOMAINS')) {
      knowledgeSourceError = 'knowledge-source-readiness.gen.ts is missing domain classification exports';
    }
  } catch {
    knowledgeSourceError = 'knowledge-source-readiness.gen.ts not found — run pnpm generate:knowledge-base';
  }

  return {
    bannedWordErrors,
    reportErrors,
    journalErrors,
    voiceErrors,
    advisorErrors,
    profileErrors,
    runtimeHelperErrors,
    settingsErrors,
    reviewed,
    needsReview,
    knowledgeSourceError,
  };
}

function isMainModule() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const result = runAiBoundaryCheck();

  console.log('\n=== Banned Words in Source ===\n');
  if (result.bannedWordErrors.length === 0) {
    pass('No banned wording appears in executable source contexts');
  } else {
    for (const message of result.bannedWordErrors) fail(message);
  }

  console.log('\n=== Reports Surface Boundary ===\n');
  if (result.reportErrors.length === 0) {
    pass('reports runtime use stays inside the admitted narrative surface');
  } else {
    for (const message of result.reportErrors) fail(message);
  }

  console.log('\n=== Journal AI Tagging Boundary ===\n');
  if (result.journalErrors.length === 0) {
    pass('journal AI tagging remains local, closed-set, and fail-close');
  } else {
    for (const message of result.journalErrors) fail(message);
  }

  console.log('\n=== Voice STT Boundary ===\n');
  if (result.voiceErrors.length === 0) {
    pass('voice transcription stays on the typed local STT surface');
  } else {
    for (const message of result.voiceErrors) fail(message);
  }

  console.log('\n=== Advisor Boundary Implementation ===\n');
  if (result.advisorErrors.length === 0) {
    pass('advisor chat retains prompt-strategy routing, local runtime use, and structured fallback markers');
  } else {
    for (const message of result.advisorErrors) fail(message);
  }

  console.log('\n=== Profile AI Boundary ===\n');
  if (result.profileErrors.length === 0) {
    pass('profile AI surfaces stay inside admitted local summary and OCR boundaries');
  } else {
    for (const message of result.profileErrors) fail(message);
  }

  console.log('\n=== Runtime Helper Boundary ===\n');
  if (result.runtimeHelperErrors.length === 0) {
    pass('ParentOS runtime helper owns binding resolution, local warmup, metadata, and fail-closed fallback policy');
  } else {
    for (const message of result.runtimeHelperErrors) fail(message);
  }

  console.log('\n=== Settings / Privacy Consistency ===\n');
  if (result.settingsErrors.length === 0) {
    pass('AI settings stay aligned with ParentOS local-only privacy posture');
  } else {
    for (const message of result.settingsErrors) fail(message);
  }

  console.log('\n=== Knowledge Source Boundary ===\n');
  pass(`Reviewed domains: ${result.reviewed.join(', ')}`);
  pass(`Needs-review domains: ${result.needsReview.join(', ')}`);
  if (result.knowledgeSourceError) fail(result.knowledgeSourceError);
  else pass('knowledge-source-readiness.gen.ts contains domain classification exports');

  const errorCount =
    result.bannedWordErrors.length
    + result.reportErrors.length
    + result.journalErrors.length
    + result.voiceErrors.length
    + result.advisorErrors.length
    + result.profileErrors.length
    + result.settingsErrors.length
    + (result.knowledgeSourceError ? 1 : 0);

  console.log(`\n${errorCount === 0 ? 'All checks passed.' : `${errorCount} error(s) found.`}\n`);
  process.exit(errorCount > 0 ? 1 : 0);
}
