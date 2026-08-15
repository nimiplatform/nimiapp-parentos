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
| Desktop shell | Electron (admitted Nimi local-development carrier) | `src-electron/` |
| Legacy shell | Tauri 2 (builds and cargo tests stay green; not an admitted Nimi local-development carrier — its Nimi integration is deferred) | `src-tauri/` |
| Frontend | React 19 + Vite 7 + Tailwind 4 | `src/shell/renderer/` |
| Local storage | SQLite (rusqlite, bundled) | `src-tauri/src/sqlite/` |
| AI | Nimi App Access `runtime.ai.text-candidate.generate` (unary, declared via `app_access: [runtime.consume]` in `nimi.app.yaml`) | via `@nimiplatform/sdk/app` |
| UI components | `@nimiplatform/kit` | link dependency |
| State | Zustand | `app-shell/app-store.ts` |
| Charts | recharts | growth curves |
| Dev port | 1426 | vite.config.ts |

## Spec Authority & Sync

`.nimi/spec/**` is ParentOS's project-local product authority. Normative product meaning belongs only in the v2 containers under `.nimi/spec/parentos/canonical/*.authority.yaml`. Detailed catalogs and schemas live under `data/structured/parentos/**` as specialized artifacts; their product roles and exclusive consumer bindings are owned by `.nimi/spec/parentos/canonical/structured-data.authority.yaml`.

When authority and code conflict, classify the implementation behavior against the exact canonical unit first. Retained behavior may update authority only through an explicit redesign decision that cites the affected unit; otherwise align the implementation or track the mismatch as a defect. Do not promote bugs, fail-open behavior, placeholder data writes, orphan surfaces, specialized artifacts, or implementation-only behavior into parallel authority.

Before making any change:
1. Read `.nimi/methodology/authority-authoring.yaml`.
2. Use exact-ID query/context against `.nimi/spec` for the affected unit.
3. Read the bound file under `data/structured/parentos/**` only when the unit concerns a specialized dataset.
4. Read source code to verify behavior or identify defects.

### Key Specialized Artifacts

| Table | Governs |
|-------|---------|
| `data/structured/parentos/reminder-rules.yaml` | All age-based reminder rules (vaccines, checkups, vision, dental, bone age, growth, sensitivity, interests, etc.) |
| `data/structured/parentos/orthodontic-protocols.yaml` | Dynamic orthodontic protocol rules + dental follow-up rules; the only authority home for `PO-ORTHO-*` and `PO-DEN-FOLLOWUP-*` ruleIds |
| `data/structured/parentos/reference-data-assets.yaml` | Registry for admitted knowledge assets and their current/target storage model |
| `.nimi/spec/parentos/canonical/knowledge-asset.authority.yaml` | Manifest, provenance, schema, section, projection, and runtime consumption authority for knowledge assets |
| `milestone-catalog` | Developmental milestones by domain and age |
| `sensitive-periods` | Montessori sensitive period definitions |
| `observation-framework` | 21 observation dimensions from 8 theories + relationship quality |
| `ability-model` | Ability-interpretation design asset; current layer count/enums are not yet frozen and must not be treated as a stable public contract |
| `growth-standards` | WHO/reference growth and health reference data |
| `data/structured/parentos/knowledge-source-readiness.yaml` | Authoritative reviewed / needs-review gate for what may enter Phase 1 AI free-form prompt |
| `data/structured/parentos/nurture-modes.yaml` | Three nurture mode parameters |
| `data/structured/parentos/local-storage.yaml` | SQLite schema (19 tables) |
| `data/structured/parentos/routes.yaml` | Application routes |
| `data/structured/parentos/feature-matrix.yaml` | Feature phasing (Phase 1-3) |

### Sync Rules

Any code change that touches spec-governed surfaces must follow:

```
Authority → Specialized artifact → Generate → Check → Evidence
```

1. Modify the canonical unit first; modify a bound structured artifact only when its detailed dataset changes.
2. Regenerate compiled TS constants via `pnpm generate:knowledge-base`.
3. Run `pnpm spec:authority:check` and `pnpm spec:authority:compile`.
4. Update code (migrations, routes, types) to match when the code is the item being changed.
5. Run full test suite.

**Drift = CI failure.** The following mismatches are blocking:
- `data/structured/parentos/local-storage.yaml` columns ≠ `migrations.rs` SQL
- `data/structured/parentos/routes.yaml` paths ≠ `routes.tsx` route definitions
- `data/structured/parentos/reminder-rules.yaml` ruleIds ≠ compiled TS constants
- `data/structured/parentos/nurture-modes.yaml` parameters ≠ `app-store.ts` types
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

- **Layer 1 (system does):** Evidence-based standardized reminders — rule-engine-driven timeline pushes from `data/structured/parentos/reminder-rules.yaml` (rigid/stage categories), trend descriptions from recorded data, knowledge organization and explanation with source citation.
- **Layer 2 (system does NOT do, defer to professionals):** Individual diagnosis, treatment recommendations, mental health evaluation, comparative ranking.
- AI uses: "观察到", "可能", "倾向于".
- AI never uses: "落后", "异常", "危险", "警告", "发育迟缓", "障碍", "应该吃", "建议用药", "建议服用", "推荐治疗".
- Data anomaly → describe objective data + "建议咨询专业人士", no causal interpretation.
- Domains marked `needs-review` in `data/structured/parentos/knowledge-source-readiness.yaml` must not enter Phase 1 free-form prompt.
- AI boundary authority lives in `.nimi/spec/parentos/canonical/advisor.authority.yaml` for advisor/reports, `.nimi/spec/parentos/canonical/profile.authority.yaml` for profile-local AI summaries and OCR-assisted extraction, `.nimi/spec/parentos/canonical/journal.authority.yaml` for journal AI tagging/STT, and `data/structured/parentos/knowledge-source-readiness.yaml` for reviewed-domain gates. `definition.parentos.project.authority-boundary` defines the v2 authority boundary; no legacy guide is active authority.
- Platform-contract reality (2026-08): the App Access contract admits unary text generation only. Vision/OCR (`parentos.profile.checkup-ocr`, `parentos.profile.dental-eruption-scan`, `parentos.medical.ocr-intake`) and STT (`parentos.journal.voice-observation`) surfaces are gated off as typed product gaps — entries stay visible with info-tone unavailable copy; never substitute a self-built channel.

### Nurture Mode Boundary
- P0 reminders are ALWAYS `push` in ALL modes. No exceptions.
- Modes only control P1-P3 visibility, content depth, AI analysis detail.
- Modes never change medical/developmental safety thresholds.

### Privacy Boundary (PIPL Compliance)
- All data stored locally in SQLite. No cloud upload. No third-party SDK data collection.
- AI conversation `contextSnapshot` freezes at send time — contains only current-session child profile summary.
- No user data leaves the device. No device ID, location, contacts, or biometrics collected.
- Child profile deletion cascades to all associated records (growth, vaccine, journal, AI conversations, reminder states).
- Privacy/storage authority lives in the relevant canonical units, with the detailed SQLite structure bound through `data/structured/parentos/local-storage.yaml`.

## Verification

```bash
# Spec layer
pnpm spec:authority:check
pnpm spec:authority:compile
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
pnpm exec nimicoding sync --check
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

Start with: `data/structured/parentos/`, `data/knowledge/`, `src/shell/renderer/engine/`, `src/shell/renderer/app-shell/`, `src-tauri/src/sqlite/`.

Skip: `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, lockfiles.

## Code Conventions

- ULID for all new IDs (not UUID).
- ISO 8601 for all date/time fields.
- JSON serialized as TEXT in SQLite.
- `childId` is the primary filter for most queries.
- ESM imports use `.js` extension even for `.ts` files.
- `@nimiplatform/sdk`, `@nimiplatform/kit`, `@nimiplatform/app-tools` are consumed as `link:` dependencies into the sibling platform checkout (`../../nimi/**`), resolving package `exports` to built `dist/` (never source aliases). After pulling platform changes or on a fresh checkout, run `pnpm prepare:workspace-surfaces` once to rebuild those dist artifacts; it is also chained into `pnpm build`.
- Tauri host glue (`nimi-shell-tauri` path crate) still builds, but Tauri is not an admitted Nimi local-development carrier; `pnpm dev` is Electron-only (`nimi-app dev --shell electron`).

<!-- nimicoding:managed:agents:start -->
# Nimi Coding Managed Block

- Product authority lives under `.nimi/spec/**`.
- For canonical authority authoring, read only `.nimi/methodology/authority-authoring.yaml`, the affected authority files or bounded task context, and CLI diagnostics.
- Use `nimicoding authority context <path> <id> --max-units <n> --max-bytes <n> --json` only for the complete declared outgoing interpretation closure; it is not complete task context, and failure never permits guessed or partial context.
- Use `nimicoding authority diff` and `authority impact` with explicit `--max-bytes`; impact reports declared review obligations and does not prove implementation, consumers, or tests are synchronized.
- Use `nimicoding authority change-candidates` only with explicit channels and budgets; its complete union is recall input, never conflict, retirement, absence, authority, or conformance judgment.
- Under `.nimi/spec/**`, author only closed multi-unit `*.authority.yaml` containers or single-unit `*.authority.md`; historical document formats are unsupported and never inferred.
- Run `nimicoding authority fmt` on each changed file, then `nimicoding authority check` on the complete authority input set.
- Never bypass a failure with inferred or fallback semantics; choose repair values only from product/task authority.
- Keep derived and local verification output under `.nimi/local/**`; it is never product authority.
<!-- nimicoding:managed:agents:end -->
