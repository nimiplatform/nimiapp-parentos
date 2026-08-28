# ParentOS Fitness Page Audit Defer

Status: `partially-implemented`
Owner: `nimi.parentos`
Updated At: `2026-08-28`
Reason: `UX/product audit of the 体能评估 (fitness assessment) page found that progress/regression comparison and national-standard grading were specified but not implemented, alongside label-fallback, input, and fail-close defects. The 2026-08-28 implementation pass closed the two high-severity spec debts and most defects; the items below remain.`
Evidence Ref:
- `pnpm spec:authority:check` / `pnpm spec:authority:compile` / `pnpm check:spec-consistency`
- `pnpm check:knowledge-base` (includes fitness-standard-tables constraints)
- `pnpm exec vitest run` (82 files, 653 tests)
- `src/shell/renderer/engine/fitness-standard-grade.ts` + `.test.ts`
- `data/structured/parentos/fitness-standard-tables.yaml`

This file is tracking-only. It is not product authority. ParentOS authority remains under `.nimi/spec/parentos/canonical/*.authority.yaml` and `data/structured/parentos/**`.

## Implemented (2026-08-28)

| Item | Resolution | Evidence |
|---|---|---|
| `fitness.standard-grade` not implemented in engine; all fitness metrics `unrated` | New governed dataset `fitness-standard-tables.yaml` (tier × sex × metric thresholds from 国家学生体质健康标准（2014年修订）, lowest-grade-per-tier derivation, provenance recorded); authority pair `definition/rule.parentos.structured.fitness.standard.tables(.binding)`; generator emits `FITNESS_STANDARD_TABLES`; engine evaluates on_track/watch/unrated with reason codes | `data/structured/parentos/fitness-standard-tables.yaml`, `src/shell/renderer/engine/fitness-standard-grade.ts`, `src/shell/renderer/engine/health-record-domain.ts` |
| No trend/progress comparison despite PO-REM-FIT-001/002 promising it | Per-metric delta vs previous record on every standard card; recharts trend card with metric selector and 优秀/良好/及格 reference lines at the child's current tier | `src/shell/renderer/features/profile/fitness-page.tsx` |
| Save failure silently swallowed | Fail-close: catchLog + inline error banner, blocks silent success | `fitness-assessment-form.tsx` |
| Raw IDs rendered (`school-health-check`, `mild-flatfoot`) | Mock data aligned to admitted enums (`school-pe`, `flat`); fallbacks render generic i18n labels, never raw IDs | `mock/tables/fitnessAssessments.json`, `fitness-page.tsx` |
| Foot arch displayable but not capturable | Optional foot-arch select in standard entries; persisted on insert and edit paths; edit reconstruction reads it back | `fitness-assessment-form.tsx`, `fitness-page.tsx` |
| Zero-metric standard entry saveable | `standardEntryHasMetric` gates save with inline hint | `fitness-assessment-form.tsx` |
| 800/1000/50×8 entered as raw seconds only | `parseFitnessTimeInput` accepts `4:05` / `4分05秒` / plain seconds | `fitness-assessment-form.tsx` + tests |
| No plausibility validation | `FITNESS_PLAUSIBLE_RANGES` per-metric validation blocks save with field errors | `fitness-assessment-form.tsx` + tests |
| Age tier ≠ school grade (144-month 6th grader gets wrong field set) | Manual 学段 override select (default auto-by-age) drives `visibleFields` | `fitness-assessment-form.tsx` |
| Structured report links fitness to `/profile` | Fixed to `/profile/fitness` | `src/shell/renderer/features/reports/structured-report.ts` |
| Gender unknown silently treated as male | Non-issue: `child.gender` is typed `'male' \| 'female'`; sex is always known | `app-shell/app-store.ts:11` |
| `window.confirm` for delete | Dropped: `window.confirm` is the current app-wide convention (dental/vision/orthodontic pages); changing one page creates inconsistency | — |
| Policy `appliesTo` (2 metrics) ≠ registry binding (15 metrics) | `appliesTo` expanded to all 15 bound metrics; sourceRefs now points at the governed artifact; a knowledge-base check now fails on registry↔appliesTo drift | `data/structured/parentos/health-evaluation-rules.yaml`, `scripts/check-parentos-knowledge-base.ts` |

## Remaining Deferred Findings

| Severity | Item | Why Deferred | Evidence |
|---|---|---|---|
| medium | `rule.parentos.prof.r013` lists `overallGrade` as a preserved fitness field, but it is never captured or stored | Requires an explicit redesign decision: either implement the official weighted total-score computation (BMI + weighted items) or revise the canonical unit to drop `overallGrade`; both are authority-level choices, not implementation detail | `.nimi/spec/parentos/canonical/profile.authority.yaml:129-137` |
| medium | grade7plus tier scores every child ≥144 months against the 初一 (lowest-grade) table; older middle/high-schoolers are graded against a bar below their actual grade's | Conservative-by-design (documented in the dataset's `derivation`), but a school-grade-aware capture (enrollment grade field on the child profile) would resolve it properly; needs a product decision and authority change first | `data/structured/parentos/fitness-standard-tables.yaml` derivation |
| low | National-standard tables admitted for 4 grade anchors only (一年级/三年级/五年级/初一); full per-grade tables (each grade 1-9 + high school) not structured | Same school-grade prerequisite as above; expanding without grade-aware capture adds unused data | `data/structured/parentos/fitness-standard-tables.yaml` |
| low | `ACTIVITY_CATEGORY_LABELS[category] ?? category` can still render a raw activity-category ID | Same fallback class fixed for source/foot-arch, but no admitted "other" label exists for activity categories yet; add one when the category enum is next touched | `fitness-page.tsx` ActivityCardBody |

## Reopen Gate

Reopen only if:

- a school-grade field is added to the child profile (unlocks per-grade tables + accurate grade7plus scoring)
- the official weighted total-score (`overallGrade`) computation is admitted or the canonical unit is revised
- new fitness surfaces (reports, advisor, reminders) begin consuming fitness evaluations and expose gaps in the admitted tables
