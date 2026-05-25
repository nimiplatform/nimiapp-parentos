# nimiapp-parentos

成长底稿 (ParentOS) — AI-driven child growth operating system, packaged as a standalone Tauri 2 + React 19 + SQLite desktop app.

> Migrated from the `apps/parentos` workspace in the `nimi-realm` monorepo. The
> nimi-realm copy remains in place; this project is the canonical standalone
> distribution.

## Architecture

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop shell | Tauri 2 | `src-tauri/` |
| Frontend | React 19 + Vite 7 + Tailwind 4 | `src/shell/renderer/` |
| Local storage | SQLite (rusqlite, bundled) | `src-tauri/src/sqlite/` |
| AI | nimi runtime (`runtime.ai.text.generate`) | via `@nimiplatform/sdk` |
| UI components | `@nimiplatform/kit` | npm dependency |
| Governance | `@nimiplatform/nimi-coding` + `.nimi/**` | bootstrap projections |

## Spec Authority

Normative product authority lives under `.nimi/spec/parentos/kernel/**` (markdown contracts + typed YAML tables). Guides:

- `.nimi/spec/INDEX.md` — domain index
- `.nimi/spec/parentos/index.md` — ParentOS domain guide
- `.nimi/spec/parentos/parentos.md` — product overview / non-goals / known defects
- `.nimi/spec/parentos/kernel/index.md` — kernel authority map

`.nimi/{config,contracts,methodology}/**` are projections from `@nimiplatform/nimi-coding`; they are managed by `pnpm nimicoding sync` and must not be hand-edited.

## Prerequisites

- Node.js ≥ 24
- pnpm ≥ 10
- Rust (stable) + Cargo, with the Tauri 2 toolchain for `src-tauri`
- Python 3 (for `generate:who-lms-assets`)

## Install

```bash
pnpm install
```

All runtime dependencies resolve from npm (`@nimiplatform/kit`,
`@nimiplatform/sdk`) and crates.io (`nimi-shell-tauri`); no sibling
`nimi-realm` checkout is required.

## Development

```bash
# Renderer only (vite dev server on http://127.0.0.1:1426)
pnpm dev:renderer

# Full Tauri shell (renderer + native window)
pnpm dev:shell
```

## Build & Verify

```bash
pnpm build                              # typecheck + vite build + cargo check
pnpm test                               # vitest run

# Spec consistency layer (matches the AGENTS.md sync rules)
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
| `.nimi/methodology/**` | Package-canonical projection (do not hand-edit) |
| `.nimi/contracts/**` | Package-canonical projection (do not hand-edit) |
| `.nimi/config/**` | Package-canonical projection (do not hand-edit) |
| `.nimi/local/**` | Local-only operational/projection output (gitignored) |
| `.nimi/cache/**` | Local cache (gitignored) |

Bump `@nimiplatform/nimi-coding`, then run `pnpm nimicoding sync --apply` to refresh the projections.

## CI

Pull requests and pushes to `main` run `.github/workflows/ci.yml`, which has two parallel jobs:

| Job | Covers |
|-----|--------|
| `Spec + TypeScript` | `nimicoding doctor`, knowledge-base generation, all `check:*` scripts, typecheck, lint, vitest, renderer build |
| `Rust (Tauri)` | `cargo fmt`, `cargo clippy -D warnings`, `cargo check`, `cargo test` against `src-tauri/` |

All `@nimiplatform/*` npm packages and the `nimi-shell-tauri` Rust crate now
resolve from their public registries, so CI runs end-to-end out of the box.

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
