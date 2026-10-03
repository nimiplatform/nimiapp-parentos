import { describe, expect, it } from 'vitest';
import {
  checkAdvisorAnswer,
  isAdvisorSourceBlock,
  renderAdvisorAnswerContent,
  resolveAdvisorPromptStrategy,
  stripAdvisorSourceBlocks,
} from './advisor-boundary.js';
import type { AdvisorIntent } from './advisor-intent.js';
import { selectAdvisorKnowledge, type AdvisorKnowledgeSelection } from './advisor-knowledge.js';

const intent = (overrides: Partial<AdvisorIntent>): AdvisorIntent => ({
  task: 'records',
  domains: [],
  groups: [],
  time: { kind: 'default' },
  compare: false,
  detail: false,
  ...overrides,
});

const none: AdvisorKnowledgeSelection = { entries: [], coverage: [] };

describe('resolveAdvisorPromptStrategy', () => {
  it('lets code, not the parse, pick the scope', () => {
    expect(resolveAdvisorPromptStrategy(intent({ task: 'chat' }), [], none)).toBe('generic-chat');
    expect(resolveAdvisorPromptStrategy(intent({ task: 'clarify' }), ['vision'], none)).toBe('unknown-clarifier');
    expect(resolveAdvisorPromptStrategy(intent({ task: 'records' }), [], none)).toBe('unknown-clarifier');
    expect(resolveAdvisorPromptStrategy(intent({ task: 'overview' }), ['growth', 'journal'], none)).toBe('needs-review-descriptive');
  });

  it('keeps any needs-review domain on the descriptive path, even mixed with reviewed ones', () => {
    const knowledge = selectAdvisorKnowledge({ domains: ['sensitivity', 'vision'], ageMonths: 48 });
    expect(knowledge.entries.length).toBeGreaterThan(0);
    expect(resolveAdvisorPromptStrategy(intent({ domains: ['sensitivity', 'vision'] }), ['journal', 'vision'], knowledge))
      .toBe('needs-review-descriptive');
  });

  it('never grants reviewed-advice without admitted age-applicable material', () => {
    const teen = selectAdvisorKnowledge({ domains: ['sleep', 'outdoor', 'sensitivity', 'digital'], ageMonths: 156 });
    expect(teen.entries).toHaveLength(0);
    expect(resolveAdvisorPromptStrategy(intent({ domains: ['sleep', 'outdoor', 'sensitivity', 'digital'] }), ['sleep', 'outdoor'], teen))
      .toBe('needs-review-descriptive');
    const preschooler = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 48 });
    expect(resolveAdvisorPromptStrategy(intent({ task: 'knowledge', domains: ['sensitivity'] }), ['journal'], preschooler))
      .toBe('reviewed-advice');
  });
});

describe('checkAdvisorAnswer', () => {
  const knowledge = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 48 });

  it('renumbers provided citations in order of first use', () => {
    const [first, second] = knowledge.entries;
    const result = checkAdvisorAnswer(`先说一点 [${second?.citeId}]。再说一点【${first?.citeId}】，还是它 [${second?.citeId}]。`, knowledge.entries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toBe('先说一点 [1]。再说一点[2]，还是它 [1]。');
    expect(result.cited.map((entry) => entry.citeId)).toEqual([second?.citeId, first?.citeId]);
  });

  it('discards answers that cite unprovided material, carry URLs, or fail the safety filter', () => {
    expect(checkAdvisorAnswer('依据资料 [K9]。', knowledge.entries)).toEqual({ ok: false, reason: 'citation' });
    expect(checkAdvisorAnswer('依据资料 [K1]。', [])).toEqual({ ok: false, reason: 'citation' });
    expect(checkAdvisorAnswer('详见 https://example.org/guide', knowledge.entries)).toEqual({ ok: false, reason: 'citation' });
    expect(checkAdvisorAnswer('这可能是发育迟缓。', knowledge.entries)).toEqual({ ok: false, reason: 'safety' });
    expect(checkAdvisorAnswer('依据如下：```json\n{"category":"口腔"}\n```', [])).toEqual({ ok: false, reason: 'format' });
    expect(checkAdvisorAnswer('记录里 recordsInPeriod 为 0。', [])).toEqual({ ok: false, reason: 'format' });
    expect(checkAdvisorAnswer('<think>...</think>   ', knowledge.entries)).toEqual({ ok: false, reason: 'empty' });
  });

  it('removes source lines the model wrote itself, keeping the answer', () => {
    expect(checkAdvisorAnswer('本周已记录 90 分钟。\n\n依据本地记录：户外活动（2026-09-28）', []))
      .toMatchObject({ ok: true, body: '本周已记录 90 分钟。' });
    expect(checkAdvisorAnswer('本周已记录 90 分钟。依据本地记录：户外活动', []))
      .toMatchObject({ ok: true, body: '本周已记录 90 分钟。' });
    expect(checkAdvisorAnswer('依据本地记录：户外活动', [])).toEqual({ ok: false, reason: 'empty' });
    expect(checkAdvisorAnswer('立定跳远增加了 8 cm。\n\n来源：成长底稿', []))
      .toMatchObject({ ok: true, body: '立定跳远增加了 8 cm。' });
    expect(checkAdvisorAnswer('立定跳远增加了 8 cm。\n\n**参考来源：**\n- 成长底稿\n- 体能记录\n\n有变化可以再记一次。', []))
      .toMatchObject({ ok: true, body: '立定跳远增加了 8 cm。\n\n有变化可以再记一次。' });
    expect(checkAdvisorAnswer('这些数据的来源：学校体测。', []))
      .toMatchObject({ ok: true, body: '这些数据的来源：学校体测。' });
  });

  it('drops reasoning markup some local models emit as text', () => {
    const result = checkAdvisorAnswer('<think>先想想</think>本周已记录 **90 分钟**。', []);
    expect(result).toMatchObject({ ok: true, body: '本周已记录 **90 分钟**。' });
  });
});

describe('renderAdvisorAnswerContent', () => {
  it('builds source lines from the entries themselves, not from domain labels', () => {
    const knowledge = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 48 });
    const entry = knowledge.entries[0];
    expect(entry).toBeDefined();
    const content = renderAdvisorAnswerContent({ body: '正文 [1]。', cited: entry ? [entry] : [], localFactSources: '随记（2026-09-28）' });
    const blocks = content.split('\n\n');
    expect(blocks[0]).toBe('正文 [1]。');
    expect(isAdvisorSourceBlock(blocks[1] ?? '')).toBe(true);
    expect(blocks[1]).toContain(`[1] ${entry?.title}（${entry?.citation}）`);
    expect(content).not.toContain('Montessori Sensitive Periods Framework');
  });

  it('strips the app-rendered source block before an answer is replayed as history', () => {
    const content = renderAdvisorAnswerContent({ body: '本周已记录 90 分钟。', cited: [], localFactSources: '户外活动（2026-09-28）' });
    expect(stripAdvisorSourceBlocks(content)).toBe('本周已记录 90 分钟。');
  });

  it('shows only the record categories and dates for fact-only answers', () => {
    const content = renderAdvisorAnswerContent({ body: '本周已记录 90 分钟。', cited: [], localFactSources: '户外活动（2026-09-28、2026-09-29）' });
    expect(content).toBe('本周已记录 90 分钟。\n\n依据本地记录：户外活动（2026-09-28、2026-09-29）');
    expect(renderAdvisorAnswerContent({ body: '你好！', cited: [], localFactSources: null })).toBe('你好！');
  });
});
