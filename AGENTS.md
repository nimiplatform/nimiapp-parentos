# ParentOS (成长底稿) AGENTS.md

> Authoritative module-level instructions for AI agents working on ParentOS.

## Identity

- **App name (Chinese)**: 成长底稿
- **App name (English)**: ParentOS
- **App ID**: `nimi.parentos`
- **One-line**: AI 驱动的儿童成长操作系统——会主动告诉家长这个阶段孩子最该关注什么。
- **Status**: Pre-Alpha, not yet launched.

## Architecture

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop shell | Tauri 2 | `src-tauri/` |
| Frontend | React 19 + Vite 7 + Tailwind 4 | `src/shell/renderer/` |
| Local storage | SQLite (rusqlite, bundled) | `src-tauri/src/sqlite/` |
| AI | nimi runtime (`runtime.ai.text.generate`) | via `@nimiplatform/sdk` |
| UI components | `@nimiplatform/kit` | npm dependency |
| State | Zustand | `app-shell/app-store.ts` |
| Charts | recharts | growth curves |
| Dev port | 1426 | vite.config.ts |

## Spec Authority & Sync

`.nimi/spec/**` is ParentOS's project-local product authority. Normative product authority belongs only in `.nimi/spec/parentos/kernel/*.md` and `.nimi/spec/parentos/kernel/tables/**`; `.nimi/spec/INDEX.md`, `.nimi/spec/parentos/index.md`, and `.nimi/spec/parentos/parentos.md` are guides. Concrete reference/content data belongs under `data/**` only when admitted by `.nimi/spec/parentos/kernel/tables/reference-data-assets.yaml`.

During authority realignment, `.nimi/spec/parentos/kernel/*.md` and `.nimi/spec/parentos/kernel/tables/**` remain the semantic authority. When spec and code conflict, first classify the implementation behavior against those authority surfaces. Retained behavior may update spec only through an explicit redesign/admission decision that cites the affected kernel authority; otherwise align the implementation to the existing kernel authority or track the mismatch as a defect. Do not promote bugs, fail-open behavior, placeholder data writes, orphan surfaces, or implementation-only behavior into authority.

Before making any change:
1. Read `.nimi/spec/INDEX.md` for the guide path.
2. Read `.nimi/spec/parentos/kernel/index.md` for the authority map.
3. Read kernel YAML tables and contracts.
4. Read source code to verify behavior or identify defects.

### Key Tables

| Table | Governs |
|-------|---------|
| `reminder-rules.yaml` | All age-based reminder rules (vaccines, checkups, vision, dental, bone age, growth, sensitivity, interests, etc.) |
| `orthodontic-protocols.yaml` | Dynamic orthodontic protocol rules + dental follow-up rules; the only authority home for `PO-ORTHO-*` and `PO-DEN-FOLLOWUP-*` ruleIds |
| `reference-data-assets.yaml` | Registry for admitted knowledge assets and their current/target storage model |
| `knowledge-asset-contract.md` | Manifest, provenance, schema, section, projection, and runtime consumption contract for knowledge assets |
| `milestone-catalog` | Developmental milestones by domain and age |
| `sensitive-periods` | Montessori sensitive period definitions |
| `observation-framework` | 21 observation dimensions from 8 theories + relationship quality |
| `ability-model` | Ability-interpretation design asset; current layer count/enums are not yet frozen and must not be treated as a stable public contract |
| `growth-standards` | WHO/reference growth and health reference data |
| `knowledge-source-readiness.yaml` | Authoritative reviewed / needs-review gate for what may enter Phase 1 AI free-form prompt |
| `nurture-modes.yaml` | Three nurture mode parameters |
| `local-storage.yaml` | SQLite schema (19 tables) |
| `routes.yaml` | Application routes |
| `feature-matrix.yaml` | Feature phasing (Phase 1-3) |

### Sync Rules

Any code change that touches spec-governed surfaces must follow:

```
Rule → Table → Generate → Check → Evidence
```

1. Modify the YAML table or contract first.
2. Regenerate compiled TS constants via `pnpm generate:knowledge-base`.
3. Run `pnpm check:spec-consistency`.
4. Update code (migrations, routes, types) to match when the code is the item being changed.
5. Run full test suite.

**Drift = CI failure.** The following mismatches are blocking:
- `local-storage.yaml` columns ≠ `migrations.rs` SQL
- `routes.yaml` paths ≠ `routes.tsx` route definitions
- `reminder-rules.yaml` ruleIds ≠ compiled TS constants
- `nurture-modes.yaml` parameters ≠ `app-store.ts` types
- admitted `observation-framework` dimensionIds ≠ compiled TS constants

## Development Principles

### No Legacy, No Shims

This project starts from zero. There is no prior version, no deployed users, no data to migrate. Therefore:
- No compatibility layers, adapters, or shims.
- No "simple version first, fix later" shortcuts.
- No degraded schemas (string instead of enum, any instead of typed).
- No backward-compatible fallback logic.
- No deprecated code markers.
- Full schema, full knowledge base, full mode parameters from day one.

### Fail-Close

- Missing reminder rule match → error, not empty list.
- Knowledge base load failure → app does not start.
- AI output violating safety boundary → discard, not display.
- Missing nurture mode parameter → default to `balanced` (the only permitted fallback).

Current implementation gaps such as silent error swallowing, typed bridge coercion, and placeholder reminder writes remain defects to fix later; they must not be treated as admitted authority.

## Hard Boundaries

### AI Boundary

Two-layer model (boundary: whether individual data inference is involved):

- **Layer 1 (system does):** Evidence-based standardized reminders — rule-engine-driven timeline pushes from `reminder-rules.yaml` (rigid/stage categories), trend descriptions from recorded data, knowledge organization and explanation with source citation.
- **Layer 2 (system does NOT do, defer to professionals):** Individual diagnosis, treatment recommendations, mental health evaluation, comparative ranking.
- AI uses: "观察到", "可能", "倾向于".
- AI never uses: "落后", "异常", "危险", "警告", "发育迟缓", "障碍", "应该吃", "建议用药", "建议服用", "推荐治疗".
- Data anomaly → describe objective data + "建议咨询专业人士", no causal interpretation.
- Domains marked `needs-review` in `knowledge-source-readiness.yaml` must not enter Phase 1 free-form prompt.
- AI boundary authority lives in `.nimi/spec/parentos/kernel/advisor-contract.md` for advisor/reports, `.nimi/spec/parentos/kernel/profile-contract.md` for profile-local AI summaries and OCR-assisted extraction, `.nimi/spec/parentos/kernel/journal-contract.md` for journal AI tagging/STT, and `.nimi/spec/parentos/kernel/tables/knowledge-source-readiness.yaml` for reviewed-domain gates. `.nimi/spec/parentos/parentos.md` is a guide and must not be treated as the full AI boundary source.

### Nurture Mode Boundary
- P0 reminders are ALWAYS `push` in ALL modes. No exceptions.
- Modes only control P1-P3 visibility, content depth, AI analysis detail.
- Modes never change medical/developmental safety thresholds.

### Privacy Boundary (PIPL Compliance)
- All data stored locally in SQLite. No cloud upload. No third-party SDK data collection.
- AI conversation `contextSnapshot` freezes at send time — contains only current-session child profile summary.
- No user data leaves the device. No device ID, location, contacts, or biometrics collected.
- Child profile deletion cascades to all associated records (growth, vaccine, journal, AI conversations, reminder states).
- Privacy/storage authority lives in `.nimi/spec/parentos/kernel/tables/local-storage.yaml` for local SQLite storage, child-scoped cascade constraints, and AI conversation/message persistence shape, with surface-specific constraints in the relevant kernel contracts. `.nimi/spec/parentos/parentos.md` is a guide and must not be treated as the full privacy source.

## Verification

```bash
# Spec layer
pnpm check:spec-consistency
pnpm check:knowledge-base
pnpm check:nurture-mode-safety
pnpm check:ai-boundary
pnpm check:knowledge-asset-governance

# Code layer
pnpm typecheck
pnpm test
pnpm lint

# Rust layer
(cd src-tauri && cargo test)
(cd src-tauri && cargo check)

# Governance layer
pnpm nimicoding:doctor
```

### Knowledge Base Validation

`check:knowledge-base` verifies constraints defined in each YAML table's `constraints` field:
- ruleId/milestoneId/periodId/dimensionId uniqueness and pattern matching
- P0 push constraint across all nurture modes
- `triggerAge` range validity
- `category=personalized` requires `triggerCondition`
- `alertIfNotBy > typicalAge.rangeEnd`
- Sensitive period `startMonths < peakMonths < endMonths`

## Retrieval Defaults

Start with: `.nimi/spec/parentos/kernel/tables/`, `data/knowledge/`, `src/shell/renderer/engine/`, `src/shell/renderer/app-shell/`, `src-tauri/src/sqlite/`.

Skip: `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, lockfiles.

## Code Conventions

- ULID for all new IDs (not UUID).
- ISO 8601 for all date/time fields.
- JSON serialized as TEXT in SQLite.
- `childId` is the primary filter for most queries.
- ESM imports use `.js` extension even for `.ts` files.
- Tauri host glue is consumed from `@nimiplatform/kit` (`kit/shell/tauri/`).

<!-- nimicoding:managed:agents:start -->
# Nimi Coding Managed Block

- Read .nimi/methodology, .nimi/spec, and .nimi/contracts before high-risk changes.
- Treat .nimi as the primary AI truth surface for this project.
- Treat `/.nimi/spec/**` as the current repo-wide product authority for this project, and use Git history for retired pre-cutover authority evidence.
- If .nimi/spec remains bootstrap-only, use .nimi/methodology/spec-reconstruction.yaml and .nimi/config/skills.yaml to drive AI-side truth reconstruction.
- Treat .nimi/methodology/spec-target-truth-profile.yaml as repo-local support guidance for future governance slices, not as the canonical reconstruction completion target or a guaranteed fresh-bootstrap seed.
- Treat .nimi/contracts/spec-reconstruction-result.yaml, .nimi/contracts/doc-spec-audit-result.yaml, .nimi/contracts/high-risk-execution-result.yaml, and .nimi/contracts/high-risk-admission.schema.yaml as machine contracts for reconstruction, audit, local-only high-risk closeout summaries, and canonical high-risk admission truth.
- Treat .nimi/config/skill-manifest.yaml, .nimi/config/host-profile.yaml, .nimi/config/host-adapter.yaml, .nimi/config/external-execution-artifacts.yaml, .nimi/config/skill-installer.yaml, .nimi/methodology/skill-runtime.yaml, .nimi/methodology/skill-installer-result.yaml, .nimi/methodology/skill-handoff.yaml, and admitted package-owned adapter profiles under adapters/**/profile.yaml as the canonical bridge to any external AI/skill execution.
- Treat standalone nimicoding as boundary-complete for bootstrap, handoff, validation, projection, and explicit admission only; do not assume packaged run-kernel, provider, scheduler, notification, or automation ownership.
- Treat .nimi/config/installer-evidence.yaml and .nimi/methodology/skill-installer-summary-projection.yaml as the operational-to-semantic installer projection boundary; do not promote concrete evidence artifacts into semantic truth.
- Treat high-risk external execution closeout, decision, ingest, and review payloads under .nimi/local/** as local-only operational projections; they do not promote semantic truth automatically, even when manager-owned.
- Use high-risk packetized execution only when authority, ownership, or cross-layer risk justifies it.
- Keep inline manager-worker as the default methodology posture; do not assume a separate worker runtime is mandatory.
- Keep code changes AI-context-efficient: favor bounded, cohesive files and split by responsibility during implementation instead of first concentrating unrelated logic into one file.
- Keep the methodology continuity-agnostic; do not assume daemon, heartbeat, or persistent manager ownership.
- Treat cutover readiness as preflight evidence only; the authority flip must come from an admitted cutover batch, not from readiness green by itself.
- Do not treat this managed block as a replacement for project-specific rules outside .nimi.
<!-- nimicoding:managed:agents:end -->
