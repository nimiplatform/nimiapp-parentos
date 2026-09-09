# nimiapp-parentos

成长底稿，全年龄儿童成长的操作系统

> Migrated from the `apps/parentos` workspace in the `nimi-realm` monorepo. The
> nimi-realm copy remains in place; this project is the canonical standalone
> distribution.

## Architecture

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop shell | Electron with a Rust data sidecar | `src-electron/`, `src-tauri/src/bin/parentos_host.rs` |
| Frontend | React 19 + Vite 7 + Tailwind 4 | `src/shell/renderer/` |
| Local storage | SQLite (rusqlite, bundled) | `src-tauri/src/sqlite/` |
| AI | nimi runtime (`runtime.ai.text.generate`) | via `@nimiplatform/sdk` |
| UI components | `@nimiplatform/kit` | npm dependency |
| Governance | `@nimiplatform/nimi-coding` + `.nimi/**` | bootstrap projections |

## Spec Authority

Normative product authority lives only in the Nimi Coding v2 containers under `.nimi/spec/parentos/canonical/*.authority.yaml`. Detailed catalogs and schemas live under `data/structured/parentos/**` as specialized artifacts bound by canonical authority; they are not a parallel authority root.

`@nimiplatform/nimi-coding` manages `.nimi/methodology/authority-authoring.yaml` plus marked blocks in `AGENTS.md` and `CLAUDE.md`. Other `.nimi/config/**`, `.nimi/contracts/**`, and `.nimi/methodology/**` files are host-owned governance and do not override product authority.

## Prerequisites

- Node.js ≥ 24
- pnpm ≥ 10
- Rust (stable) + Cargo for the Electron data sidecar
- Python 3 (for `generate:who-lms-assets`)

## Install

```bash
pnpm install
```

SDK and Kit JavaScript dependencies resolve from npm. The Rust data sidecar currently requires the sibling `../../nimi/kit/shell/tauri` source dependency.

## Development

```bash
# Desktop-supervised Electron (default proven path)
pnpm dev

# Explicit Desktop-supervised shell selection
pnpm dev:electron
pnpm dev:shell -- --shell electron

# Renderer-only, intentionally without protected operations
pnpm dev:renderer
```

## Build & Verify

```bash
pnpm build                              # typecheck + vite build + cargo check
pnpm test                               # vitest run

# Spec consistency layer (matches the AGENTS.md sync rules)
pnpm spec:authority:check
pnpm spec:authority:compile
pnpm generate:knowledge-base
pnpm check:spec-consistency
pnpm check:knowledge-base
pnpm check:nurture-mode-safety
pnpm check:ai-boundary
pnpm check:knowledge-asset-governance

# Governance projection health
pnpm nimicoding:doctor
```

## Governance Workflow

This project consumes `@nimiplatform/nimi-coding` as a devDependency. Project-local AI truth lives under `.nimi/`:

| Surface | Role |
|---------|------|
| `.nimi/spec/**` | Host-authored product authority (this repo) |
| `.nimi/methodology/authority-authoring.yaml` | Package-canonical authoring guide |
| `.nimi/config/**`, `.nimi/contracts/**`, other `.nimi/methodology/**` | Host-owned governance; never product authority |
| `data/structured/parentos/**` | Specialized structured artifacts bound by canonical authority |
| `.nimi/local/**` | Local-only operational/projection output (gitignored) |
| `.nimi/cache/**` | Local cache (gitignored) |

Bump `@nimiplatform/nimi-coding`, then run `pnpm exec nimicoding sync --apply` to refresh package-managed surfaces.

## CI

Pull requests and pushes to `main` run `.github/workflows/ci.yml`, which has two parallel jobs:

| Job | Covers |
|-----|--------|
| `Spec + TypeScript` | `nimicoding doctor`, knowledge-base generation, all `check:*` scripts, typecheck, lint, vitest, renderer build |
| `Rust data sidecar` | `cargo fmt`, `cargo clippy -D warnings`, `cargo check`, `cargo test` against `src-tauri/` |

The Rust checks require the sidecar source dependency described above.

## Release

Releases follow the same shape as the `nimi` workspace's
`release-desktop` job (matrix build, three-way macOS signing-mode split,
dry-run vs publish boolean) — see
[`nimi-realm/nimi/.github/workflows/release.yml`](https://github.com/nimiplatform/nimi/blob/main/.github/workflows/release.yml)
for the source-of-truth pattern.

Two entry points:

- **Tag push** — `git push origin v0.1.0` → `publish=true`, real GitHub
  Release.
- **Manual dispatch** — Actions UI → `release.yml` → `version=0.1.0`,
  `publish=false` (default) → artifacts go to workflow run outputs for
  inspection without publishing a Release.

Matrix: `ubuntu-22.04` (AppImage), `macos-latest` (`.app`/`.dmg`),
`windows-latest` (NSIS `.exe`). macOS signing mode is controlled by the repo
variable `PARENTOS_MACOS_SIGNING_MODE` (`developer-id` requires the Apple
secrets listed in RELEASE.md; `ad-hoc` skips notarization).

See [RELEASE.md](./RELEASE.md) for the full pre-flight checklist, version
lockstep rules, secrets/variables reference, and hotfix flow.

## Versioning & Changelog

This project follows [Semantic Versioning](https://semver.org/). User-visible
changes are logged in [CHANGELOG.md](./CHANGELOG.md) under
[Keep a Changelog](https://keepachangelog.com/) format.

## License

[MIT](./LICENSE)

## Windows package and release

The production target is Windows x86_64 using Desktop-supervised Electron.
Build and inspect the package from this repository:

```bash
pnpm run sync
pnpm exec nimi-app check --production
pnpm exec nimi-app test
pnpm exec nimi-app build --target windows-x86_64 --production
pnpm exec nimi-app pack --target windows-x86_64 --production
```

Before tagging, follow the [GitHub release setup guide](https://github.com/nimiplatform/nimi/blob/main/app-tools/README.md#publishing-on-github), including the `NIMI_REPOSITORY_ADMIN_TOKEN` Actions secret.
A protected annotated version tag on the repository default branch runs the managed build, provenance and immutable Release workflow.
The publisher then submits the immutable Release to [Nimi App Registry](https://github.com/nimiplatform/nimi-app-registry). Registry admission is a separate human review; local builds and GitHub Releases do not create admission or installed state.
