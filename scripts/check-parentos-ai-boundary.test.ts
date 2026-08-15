import { describe, expect, it } from 'vitest';
import {
  collectBannedWordViolations,
  findAdvisorBoundaryErrors,
  findProfileBoundaryErrors,
  findReportsBoundaryErrors,
  findRuntimeHelperBoundaryErrors,
  findSettingsPrivacyErrors,
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

  it('requires advisor snapshot and fail-close markers', () => {
    const errors = findAdvisorBoundaryErrors({
      advisorPageSource: [
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
        "surfaceId: 'parentos.advisor'",
        'contextSnapshot: snapshotJson',
        'runParentosTextGenerate',
        'buildAdvisorRuntimeInput(',
        'shouldAppendAdvisorSources(',
        '运行时响应触发了安全过滤',
      ].join('\n'),
      advisorBoundarySource: [
        'export type AdvisorPromptStrategy',
        "return 'generic-chat';",
        "return 'unknown-clarifier';",
        "return 'reviewed-advice';",
        "return 'needs-review-descriptive';",
      ].join('\n'),
    });

    expect(errors).toEqual([]);
  });

  it('requires the unary text-candidate helper with budget guards and no legacy surfaces', () => {
    const errors = findRuntimeHelperBoundaryErrors([
      'export async function runParentosTextGenerate',
      'getParentOSNimiClient().ai.text.generateCandidate({',
      'isParentosAISurfaceExecutable(input.surfaceId)',
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

  it('flags settings/privacy drift when cloud controls remain exposed', () => {
    const errors = findSettingsPrivacyErrors({
      settingsPageSource: '所有数据存储在本地，不上传至云端',
      aiSettingsSurfaceSources: [
        {
          path: 'src/shell/renderer/features/settings/ai-settings-page.tsx',
          content: "value: 'cloud'\nConnector ID\nroute、model 和 connector",
        },
      ],
      aiConfigSource: "scopeRef: { ownerId: 'nimi.parentos' }, connectorId: 'openai-main'; client.aiConfig.overwrite([])",
    });

    expect(errors).toEqual(expect.arrayContaining([
      "AI settings must stay local-only while privacy copy says no cloud upload (value: 'cloud' in src/shell/renderer/features/settings/ai-settings-page.tsx)",
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
