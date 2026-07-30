# Release Process

ParentOS ships as a Tauri 2 desktop app for macOS (Apple Silicon + Intel via
universal-ish single-`macos-latest` build), Windows (x86_64 NSIS), and Linux
(x86_64 AppImage).

This flow mirrors the `release-desktop` job in the `nimi` workspace
(`nimi-realm/nimi/.github/workflows/release.yml`). It is adapted for the
standalone single-app layout: same matrix shape, same macOS signing-mode
switch, same dry-run / publish boolean, simplified down to one release target.

## Triggers

There are two ways to start a release:

1. **Tag push** — push an annotated tag matching `v[0-9]+.[0-9]+.[0-9]+` (or
   pre-release `vX.Y.Z-rc.N`) to `main`. The workflow runs with `publish=true`
   and produces a published GitHub Release.
2. **Manual dispatch** — run `release.yml` from the Actions UI with:
   - `version`: the semver string (with or without leading `v`)
   - `publish`: `false` → dry-run, artifacts go to workflow run outputs only.
     `true` → publish a real GitHub Release at tag `vX.Y.Z`.

The default for manual dispatch is `publish=false`, matching `desktop`'s
preflight-before-tag convention.

## Versioning

Semantic Versioning ([semver.org](https://semver.org/)).

- **MAJOR** — Incompatible schema/migration, breaking a stored database on
  disk, or removing a publicly admitted contract.
- **MINOR** — New feature, new admitted contract, new YAML table entries.
- **PATCH** — Bug fix, dependency bump, internal refactor with no external
  contract change.

Pre-releases use `vX.Y.Z-rc.N` / `vX.Y.Z-beta.N`. The workflow auto-flags
those as GitHub pre-releases (gated on the `-` in the tag).

The version string lives in three places that **must stay in lockstep**.
The release workflow fails fast if any of them disagrees with the tag.

| File | Field |
|------|-------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `[package].version` |

## Pre-flight Checklist

1. **Lockstep version bump**

   ```bash
   NEW_VERSION=0.2.0
   npm version --no-git-tag-version "$NEW_VERSION"
   sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
   sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
   ```

2. **Update CHANGELOG.md** — promote `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`,
   open a fresh `[Unreleased]` above it.

3. **Run the full local verification**:

   ```bash
   pnpm install
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
   (cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
   ```

4. **Dry-run the release workflow** from the GitHub Actions UI:
   - Trigger `release.yml` via `workflow_dispatch`
   - Set `version` = `0.2.0`, `publish` = `false`
   - Inspect the produced bundles under each matrix job's "Artifacts"
   - Confirm the macOS bundle matches the expected signing mode

5. **Commit, tag, push**:

   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md
   git commit -m "release: v$NEW_VERSION"
   git tag -a "v$NEW_VERSION" -m "ParentOS v$NEW_VERSION"
   git push origin main
   git push origin "v$NEW_VERSION"
   ```

6. **Monitor the release workflow** — once all three platform builds succeed,
   the GitHub Release is published automatically.

## Repo Variables

Set under **Settings → Secrets and variables → Actions → Variables**.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PARENTOS_MACOS_SIGNING_MODE` | `developer-id` | Either `developer-id` (signed + notarized, requires Apple secrets) or `ad-hoc` (unsigned, no notarization). Mirrors `NIMI_DESKTOP_MACOS_SIGNING_MODE`. |

## Secrets

Set under **Settings → Secrets and variables → Actions → Secrets**.

The workflow checks for these conditionally based on `PARENTOS_MACOS_SIGNING_MODE`.
Missing Apple secrets while `developer-id` mode is active fails the build
fast; ad-hoc mode and non-macOS jobs do not require them.

| Secret | Mode | Purpose |
|--------|------|---------|
| `APPLE_CERTIFICATE` | developer-id | Developer ID Application cert (base64 `.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | developer-id | Password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | developer-id | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | developer-id | Apple ID email for notarization |
| `APPLE_PASSWORD` | developer-id | App-specific password for notarization |
| `APPLE_TEAM_ID` | developer-id | Apple Developer Team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | optional | Tauri updater signing private key. Required if you ship in-app updates. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | optional | Password for the updater key |

Generate a Tauri updater key locally:

```bash
pnpm exec tauri signer generate -w ~/.tauri/parentos.key
```

The **private key** goes into `TAURI_SIGNING_PRIVATE_KEY`, the matching
**public key** goes into `src-tauri/tauri.conf.json` under
`plugins.updater.pubkey` once the updater is enabled in the bundle config.

Windows code signing is not wired today. When the project starts shipping
signed `.msi` / `.exe` bundles, add `WINDOWS_CERTIFICATE` +
`WINDOWS_CERTIFICATE_PASSWORD` and a signing step in `release.yml`.

## Workflow Internals

`release.yml` has two jobs:

1. **`resolve`** — extracts `version` / `version_plain` / `tag` / `publish`
   into outputs from either the pushed tag or the manual dispatch inputs.
   Rejects malformed semver.

2. **`release-app`** — matrix of `ubuntu-22.04` / `macos-latest` /
   `windows-latest`. Steps:
   - Validate version sync across the three version files
   - Generate knowledge base + WHO LMS assets
   - Resolve macOS signing mode (`developer-id` / `ad-hoc` / `not-applicable`)
   - Validate signing inputs (fail fast if developer-id mode lacks Apple
     secrets)
   - Call `tauri-apps/tauri-action` via one of three branches:
     - non-macOS
     - macOS ad-hoc (sets `APPLE_SIGNING_IDENTITY: '-'`)
     - macOS Developer ID (passes all six Apple secrets)
   - Resolve the chosen branch's artifactPaths
   - For `publish=true`: tauri-action creates / updates the GitHub Release
     and uploads the artifacts inline
   - For `publish=false`: artifacts are uploaded to the workflow run via
     `actions/upload-artifact` and there is no GitHub Release write

The three-branch macOS split exists because tauri-action reads
`APPLE_SIGNING_IDENTITY` at process-env time; the empty / `-` / Developer ID
values cannot be merged into a single step.

## Future Hardening

The `nimi` desktop release additionally does:

- **SBOM + sigstore signing** via `scripts/release/sign-and-sbom-artifacts.mjs`
  (cosign + syft).
- **Updater manifest validation** via `check:desktop-updater-artifacts`.
- **E2E smoke gates** before publishing.
- **Runtime bundle preparation** for the bundled local runtime.

None of these are required for ParentOS's current shape (no bundled runtime,
no Live LLM smoke matrix, no first-party E2E). Add them when the threat
model or distribution surface demands it; the desktop workflow is the
reference implementation.

## Governance projection sync

If `@nimiplatform/nimi-coding` ships a new minor/major version, bump it in
`package.json` and rerun:

```bash
pnpm install
pnpm exec nimicoding sync --apply
pnpm nimicoding:doctor
```

Commit the updated `.nimi/methodology/authority-authoring.yaml` alongside
the `package.json` bump in the same release.

## Hotfix

For a hotfix off a published release:

```bash
git checkout -b hotfix/vX.Y.(Z+1) vX.Y.Z
# apply fix, run pre-flight checklist
git tag -a "vX.Y.$((Z+1))" -m "ParentOS vX.Y.$((Z+1)) hotfix"
git push origin "hotfix/vX.Y.$((Z+1))" "vX.Y.$((Z+1))"
```

Open a PR from `hotfix/*` into `main` so the fix lands on the main line.
