# ParentOS Puberty Reference Gaps Defer

Status: `deferred`
Owner: `nimi.parentos`
Updated At: `2026-08-28`
Reason: `The puberty development (Tanner) page now surfaces growth-context and progression information, but several normative datasets that a fuller implementation would consume do not exist as admitted knowledge assets. The UI intentionally ships objective, record-derived descriptions only; these typed gaps must be closed through the knowledge-asset admission flow before any normative or predictive wording is added.`
Evidence Ref:
- `pnpm check:knowledge-base`
- `pnpm check:ai-boundary`
- `pnpm check:knowledge-asset-governance`

This file is tracking-only. It is not product authority. ParentOS authority remains under `.nimi/spec/parentos/canonical/*.authority.yaml` and `data/structured/parentos/**`.

## Typed Gaps

| Severity | Item | Why Deferred | Evidence |
|---|---|---|---|
| high | No PHV (peak height velocity) normative dataset | Height velocity on the Tanner overview card is shown as a purely objective annualized figure from the child's own records; without an admitted PHV reference there is no basis for judging fast/slow, and inventing norms is prohibited | `src/shell/renderer/features/profile/tanner-overview-cards.tsx` (computeHeightVelocity) |
| high | No pubertal body-fat reference ranges | McCarthy-2006 is cited in the growth-standards asset but has no data shard, so the body-fat card shows only an objective delta vs the previous record and must not gain reference-range wording | `data/knowledge/assets/growth-standards/asset.json:72`, `data/knowledge/assets/growth-standards/measurement-types/body-fat-percentage.json:11` |
| medium | No Tanner-stage-by-age normative table | Stage guidance shows the existing qualitative timing strings only; no per-stage age norm table exists as an admitted asset, so no "ahead/behind typical stage timing" judgment may be rendered | `src/shell/renderer/locales/zh.json` (`Tanner.page.guide.primaryTiming*` / `pubicHairTiming*`) |
| medium | `development.puberty-six-month-cadence` freshness policy referenced but not defined | Multiple development metrics declare this freshnessPolicyRef, yet no registry defines the policy; reminder freshness behavior for these metrics has no admitted definition to execute against | `data/structured/parentos/health-metric-registry.yaml:523`, `src/shell/renderer/knowledge-base/gen/health-record.gen.ts:872` |

## Recommended Reopen Scope

Reopen this defer only when one of these scopes is intentionally frozen for execution:

1. `parentos-phv-reference-admission`
   Focus:
   - admit a sourced PHV / height-velocity reference dataset via the knowledge-asset flow
   - only then add normative velocity wording to the Tanner overview height block

2. `parentos-pubertal-bodyfat-reference-admission`
   Focus:
   - shard the cited McCarthy-2006 body-fat reference data into the growth-standards asset
   - only then add reference-range display to the body-fat card

3. `parentos-tanner-stage-age-norms-admission`
   Focus:
   - admit a sourced Tanner-stage-by-age normative table
   - only then add stage-timing comparison wording beyond the existing qualitative strings

4. `parentos-freshness-policy-registry`
   Focus:
   - define `development.puberty-six-month-cadence` (and audit other dangling freshnessPolicyRef values) in an admitted registry
   - wire reminder freshness evaluation to the defined policy

## Reopen Gate

Do not reopen merely to restate current gaps. Reopen only if:

- a sourced dataset for one of the gaps above is approved for admission through the knowledge-asset governance flow
- product authority explicitly redesigns one of the affected surfaces to consume normative data

## Closeout Snapshot

Closed by defer after:

- menarche status/date capture and display landed on the Tanner page (rule.parentos.prof.r012 optional female fields)
- growth-context height block, 12-month stage-progression indicator, next-stage preview, and normative timing line shipped using only record-derived or already-admitted wording
- bone-age card wording aligned to `data/knowledge/assets/growth-standards/reference-ranges/boneage.json` (±1 year common range, ±2 years consult endocrinology, reference-only)
- body-fat card limited to an objective delta vs the previous record
