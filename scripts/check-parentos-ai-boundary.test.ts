import { describe, expect, it } from 'vitest';
import {
  collectBannedWordViolations,
  findAdvisorBoundaryErrors,
  findProfileBoundaryErrors,
  findReportsBoundaryErrors,
  findRuntimeHelperBoundaryErrors,
  findSettingsPrivacyErrors,
  findTextTurnHelperBoundaryErrors,
  findVoiceBoundaryErrors,
} from './check-parentos-ai-boundary.js';

describe('check-parentos-ai-boundary', () => {
  it('allows reports runtime usage inside the admitted narrative surface', () => {
    const errors = findReportsBoundaryErrors({
      routesSource: '<Route path="/reports" />',
      reportFiles: [
        {
          path: 'features/reports/narrative-prompt.ts',
          content: "filterAIResponse(); runParentosTextGenerate({ surfaceId: 'parentos.report' });",
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('fails when report runtime usage is missing safety markers', () => {
    const errors = findReportsBoundaryErrors({
      routesSource: '<Route path="/reports" />',
      reportFiles: [
        {
          path: 'features/reports/unsafe.ts',
          content: 'runtime.ai.text.stream({});',
        },
      ],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'features/reports/unsafe.ts uses report runtime without the parentos.report surface marker',
        'features/reports/unsafe.ts uses report runtime without AI safety filtering',
        'features/reports/unsafe.ts must use the governed ParentOS text runtime helper',
      ]),
    );
  });

  it('allows admitted profile summary and OCR surfaces', () => {
    const errors = findProfileBoundaryErrors({
      rootPath: '/repo',
      profileFiles: [
        {
          path: '/repo/src/shell/renderer/features/profile/ai-summary-card.tsx',
          content: 'const surfaceId = `parentos.profile.summary.${domain}`; dataContext; filterAIResponse(); runParentosTextGenerate({ surfaceId });',
        },
        {
          path: '/repo/src/shell/renderer/features/profile/checkup-ocr.ts',
          content: "parseOCRMeasurementExtraction(raw); throw createParentosAISurfaceUnavailableError('parentos.profile.checkup-ocr');",
        },
        {
          path: '/repo/src/shell/renderer/features/profile/medical-events-page-insights.ts',
          content: [
            'filterAIResponse(text);',
            "runParentosTextGenerate({ surfaceId: 'parentos.medical.smart-insight' });",
            "runParentosTextGenerate({ surfaceId: 'parentos.medical.event-analysis' });",
          ].join('\n'),
        },
        {
          path: '/repo/src/shell/renderer/features/profile/medical-events-page-form-state.ts',
          content: "setOcrError(i18nText('MedicalEvents.form.ocrRuntimeUnavailable'));",
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('fails when profile runtime usage appears on an unadmitted surface', () => {
    const errors = findProfileBoundaryErrors({
      rootPath: '/repo',
      profileFiles: [
        {
          path: '/repo/src/shell/renderer/features/profile/unsafe.ts',
          content: "runtime.ai.text.generate({ metadata: { surfaceId: 'parentos.profile.unsafe' } });",
        },
      ],
    });

    expect(errors).toContain(
      'Unexpected profile AI runtime use in src/shell/renderer/features/profile/unsafe.ts',
    );
  });

  const advisorSources = () => ({
    advisorPageSource: ['runAdvisorTurn(', 'const isCurrent = () => true;', 'request.abort.abort();'].join('\n'),
    advisorTurnSource: [
      "surfaceId: 'parentos.advisor'",
      'runParentosTextTurn(',
      'parseAdvisorIntent(',
      'readAdvisorSources(',
      'advisorFactsReadFailures(',
      'resolveAdvisorPromptStrategy(',
      'buildAdvisorContextSnapshot(',
      'checkAdvisorAnswer(',
      'if (!live()) return canceled();',
      'control.persistAssistant(',
    ].join('\n'),
    advisorBoundarySource: [
      'export type AdvisorPromptStrategy',
      'REVIEWED_DOMAINS',
      'NEEDS_REVIEW_DOMAINS',
      'filterAIResponse(',
      'CITATION_PATTERN',
      "return 'generic-chat';",
      "return 'unknown-clarifier';",
      "return 'reviewed-advice';",
      "return 'needs-review-descriptive';",
    ].join('\n'),
    advisorPromptSource: "if (strategy === 'reviewed-advice' && knowledge.entries.length > 0) {",
  });

  it('requires the typed-intent, checked-answer, and ownership markers of an advisor turn', () => {
    expect(findAdvisorBoundaryErrors(advisorSources())).toEqual([]);
  });

  it('fails when the keyword router or knowledge outside reviewed-advice returns', () => {
    const sources = advisorSources();
    const errors = findAdvisorBoundaryErrors({
      ...sources,
      advisorTurnSource: `${sources.advisorTurnSource}\ninferRequestedDomains(question)`,
      advisorPromptSource: 'sections.push(knowledgeEntries)',
    });
    expect(errors).toEqual(expect.arrayContaining([
      'advisor must not retain the keyword/template path: inferRequestedDomains',
      'advisor-prompt.ts must hand knowledge entries only to the reviewed-advice strategy',
    ]));
  });

  it('keeps the text-turn helper conversation-only, cancelable, and tool-free', () => {
    const helper = [
      'export async function runParentosTextTurn',
      'getParentOSNimiClient().ai.text.streamTurn({',
      'isParentosAISurfaceExecutable(input.surfaceId)',
      '!policy.conversation',
      'requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)',
      'subscription.cancel()',
      "event.finishReason !== 'stop'",
    ].join('\n');
    expect(findTextTurnHelperBoundaryErrors(helper)).toEqual([]);
    expect(findTextTurnHelperBoundaryErrors(`${helper}\ntools: []`)).toEqual(['parentos-ai-text-turn.ts must not declare tools:']);
  });

  it('requires the protected Scenario Job STT path and fail-close transcript validation', () => {
    const errors = findVoiceBoundaryErrors([
      'runRuntimeSpeechTranscribe',
      'createNimiLocalAppRuntimeScenarioJobClient',
      'requireParentosAIConfigCapability',
      'PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT',
      'if (!transcript)',
      'parentos.journal.voice-observation',
    ].join('\n'));

    expect(errors).toEqual([]);
  });

  it('requires the unary text-candidate helper with budget guards and no legacy surfaces', () => {
    const errors = findRuntimeHelperBoundaryErrors([
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
    ].join('\n'));

    expect(errors).toEqual([]);
  });

  it('flags legacy first-party execution surfaces in the runtime helper', () => {
    const errors = findRuntimeHelperBoundaryErrors([
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
      'streamNimiTextResponse({',
      'runtime.ai.executeScenario(',
    ].join('\n'));

    expect(errors).toEqual(expect.arrayContaining([
      'parentos-ai-runtime.ts must not retain legacy runtime surface: streamNimiTextResponse',
      'parentos-ai-runtime.ts must not retain legacy runtime surface: executeScenario',
    ]));
  });

  const settingsPrivacyInput = () => ({
    manifestSource: 'app_id: nimi.parentos\napp_access:\n  - runtime.consume\n',
    aiSettingsSurfaceSources: [
      { path: 'src/shell/renderer/features/settings/ai-settings-page.tsx', content: '<ParentosAIConfigEditor />' },
    ],
    aiConfigEditorSource: [
      '<ModelConfigAIConfigSurface',
      "context={{ owner: 'app-ai-config', appId: PARENTOS_APP_ID }}",
      'listOptions={(query) => getParentosAIConfigManager().listOptions(query)}',
      'const result = await getParentosAIConfigManager().overwrite(input);',
    ].join('\n'),
    aiConfigSource: "export const PARENTOS_TEXT_CAPABILITY_CONTRACT = 'text.generate';",
    privacyAiCopy: [
      { locale: 'en', text: 'With a Cloud model, the input a request needs is sent through Nimi to the cloud service you chose.' },
      { locale: 'zh', text: '选择云端模型时，完成该次请求所需的内容会经 Nimi 发送到你选择的云端服务。' },
    ],
  });

  it('accepts AI settings that keep both routes and disclose Cloud inference', () => {
    expect(findSettingsPrivacyErrors(settingsPrivacyInput())).toEqual([]);
  });

  it('flags route narrowing, Cloud rejection, local-only privacy copy, and custody material', () => {
    const input = settingsPrivacyInput();
    const errors = findSettingsPrivacyErrors({
      ...input,
      manifestSource: `${input.manifestSource}ai_config_ui:\n  allowed_routes:\n    - local\n`,
      aiSettingsSurfaceSources: [
        {
          path: 'src/shell/renderer/features/settings/parentos-ai-config.ts',
          content: "{ reasonCode: 'parentos-ai-cloud-route-not-admitted' }",
        },
        {
          path: 'src/shell/renderer/features/settings/parentos-ai-config-editor.tsx',
          content: "allowedRoutes={['local']}",
        },
      ],
      aiConfigEditorSource: 'createNimiLocalAIConfigCapabilityIntent({})',
      aiConfigSource: "scopeRef: { ownerId: 'nimi.parentos' }, connectorId: 'openai-main'; client.aiConfig.overwrite([])",
      privacyAiCopy: [
        { locale: 'en', text: 'Current AI features use local models through Nimi; cloud model configurations are rejected.' },
        { locale: 'zh', text: '当前 AI 功能通过 Nimi 使用本地模型。' },
      ],
    });

    expect(errors).toEqual(expect.arrayContaining([
      'nimi.app.yaml must not narrow AIConfig route choices with ai_config_ui',
      'AI settings must not reject or narrow the Cloud route (parentos-ai-cloud-route-not-admitted in src/shell/renderer/features/settings/parentos-ai-config.ts)',
      'AI settings must not reject or narrow the Cloud route (allowedRoutes= in src/shell/renderer/features/settings/parentos-ai-config-editor.tsx)',
      'parentos-ai-config-editor.tsx must edit AIConfig through the shared Kit surface (missing ModelConfigAIConfigSurface)',
      'PrivacySettings.ai.body (en) must explain what a Cloud route sends instead of claiming local-only AI',
      'PrivacySettings.ai.body (zh) must explain what a Cloud route sends instead of claiming local-only AI',
      'ParentOS AI config must recognize the portable text.generate capability intent',
      'ParentOS AI config must remain a read-only platform projection',
      'ParentOS AI config must not carry custody material: connectorId',
      'ParentOS AI config must not carry custody material: ownerId',
    ]));
  });

  it('ignores banned wording when it appears only inside string literals', () => {
    const errors = collectBannedWordViolations(
      [
        {
          path: '/repo/src/example.tsx',
          content: "const prompt = { label: '屈光异常筛查', desc: '不使用\"异常\"等词汇' };",
        },
      ],
      '/repo',
    );

    expect(errors).toEqual([]);
  });

  it('still flags banned wording in executable non-string contexts', () => {
    const errors = collectBannedWordViolations(
      [
        {
          path: '/repo/src/example.ts',
          content: 'const 异常状态 = computeRisk();',
        },
      ],
      '/repo',
    );

    expect(errors).toEqual([
      "Banned word '异常' found in src/example.ts:1 (non-string, non-comment context)",
    ]);
  });
});
