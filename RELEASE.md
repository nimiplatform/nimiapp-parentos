# Release Process

ParentOS (`0.1.9`) ships as an Electron Nimi App supervised by Nimi Desktop, paired with a Rust `parentos_host` sidecar. It is packaged and released through `@nimiplatform/app-tools` and `.github/workflows/nimi-app-release.yml` rather than as a standalone Tauri NSIS/AppImage desktop installer.

## Declared Targets

Release targets are defined in `.nimi/config/build-profile.yaml`:

- `windows-x86_64`
- `macos-aarch64`

Linux and Intel macOS targets are not currently declared.

## Triggers and Workflow Behavior

`.github/workflows/nimi-app-release.yml` separates development candidate checks from production releases:

1. **Pull requests and `workflow_dispatch`** — build and pack development candidates only. Manual dispatch is strictly a candidate build/pack run; it does not take `version` or `publish` inputs, create git tags, publish a GitHub Release, or mutate the registry.
2. **Protected `v*` tag push** — pushing an annotated tag matching the exact `package.json` version (for example, `v0.1.9`) whose tagged commit is on the canonical default branch triggers the production pipeline:
   - Validates tag, branch, and repository protection prerequisites.
   - Runs production `check`, `build`, and `pack` (`--production`) for every target in `.nimi/config/build-profile.yaml`.
   - Generates per-target GitHub artifact attestations and runs `aggregate` across the target bundles.
   - Creates or resumes the matching draft GitHub Release without overwriting existing assets.
   - Publishes and verifies the immutable GitHub Release.

## Versioning

ParentOS follows Semantic Versioning ([semver.org](https://semver.org/)):

- **MAJOR** — Incompatible schema/migration, breaking an on-disk database contract, or removing an admitted contract.
- **MINOR** — New feature, new admitted contract, or new YAML table entries.
- **PATCH** — Bug fix, dependency bump, or internal refactor with no external contract change.

Keep the exact semantic version aligned across `package.json` (currently `0.1.9`), `nimi.app.yaml`, `.nimi` identity/submission inputs, and any remaining Cargo/Tauri manifests (`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) enforced by repository checks. Update the manifests directly and let `nimi-app check` verify alignment.

## Local Preparation

Run this preparation flow on Windows x86_64. On an Apple Silicon Mac, replace `windows-x86_64` with `macos-aarch64`:

```bash
pnpm install --frozen-lockfile
pnpm exec nimi-app sync
pnpm exec nimi-app check
pnpm exec nimi-app test
pnpm exec nimi-app build --target windows-x86_64
pnpm exec nimi-app pack --target windows-x86_64
```

Local development `pack` outputs are development candidates and cannot be admitted as production release artifacts.

To run formal production preparation on a host matching the target platform:

```bash
pnpm exec nimi-app check --production
pnpm exec nimi-app build --target windows-x86_64 --production
pnpm exec nimi-app pack --target windows-x86_64 --production
```

Before tagging a release, also run the repository's domain, governance, and Rust `parentos_host` checks:

```bash
pnpm nimicoding:doctor
pnpm generate:knowledge-base
pnpm generate:who-lms-assets
pnpm check:spec-consistency
pnpm check:knowledge-base
pnpm check:knowledge-asset-governance
pnpm check:nurture-mode-safety
pnpm check:ai-boundary
pnpm typecheck
pnpm test
pnpm lint
```

## GitHub Prerequisites and Signing Posture

- **Tag protection** — A repository ruleset must protect `v*` tags against updates and deletion.
- **Immutable releases** — GitHub immutable releases must be enabled on the repository.
- **Required Actions secret** — Set `NIMI_REPOSITORY_ADMIN_TOKEN` under **Settings → Secrets and variables → Actions → Secrets** with repository `Administration: read-only` permission so the workflow can verify tag rules and immutable release settings without mutating repository configuration.
- **Native publisher signing posture** — `pack --production` inspects and records the actual native signing posture in the target metadata. The current posture allows `production-unsigned`, and `macos-aarch64` uses a publisher ad-hoc seal rather than Apple Developer ID signing and notarization. Mandatory Windows PFX or Apple Developer ID certificates are not required to run the workflow, and Nimi never counter-signs third-party code.

## Publishing and Verification Boundary

`@nimiplatform/app-tools` provides the shared `nimi-app publish` command for preflight checks, tag creation, workflow observation, and registry PR preparation. Documenting this workflow does not claim that a specific production release run, Registry admission review, or installed-runtime acceptance has already completed; verify each release run and downstream admission status separately.

## Governance Projection Sync

When updating `@nimiplatform/nimi-coding` in `package.json`, resynchronize the governance projection before committing:

```bash
pnpm install
pnpm exec nimicoding sync --apply
pnpm nimicoding:doctor
```

Commit the updated `.nimi/methodology/authority-authoring.yaml` alongside the `package.json` change.

## Hotfixes

Because production releases require the annotated `v<version>` tag to point to a commit on the canonical default branch, land and verify the hotfix commit on the default branch first, then create and push the annotated `v<version>` tag from that commit.
