# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial standalone project layout migrated from `apps/parentos` in the
  `nimi-realm` monorepo.
- `.nimi/spec/parentos/**` host-authored product authority.
- `@nimiplatform/nimi-coding` governance projection under
  `.nimi/{config,contracts,methodology}/**`.
- `.github/workflows/ci.yml` — Spec + TypeScript + Rust CI.
- `.github/workflows/release.yml` — Tag-triggered Tauri multi-platform release.

### Resolved
- `@nimiplatform/kit@0.1.0` published to npm — `pnpm install` works end-to-end.
- `nimi-shell-tauri@0.1.0` published to crates.io — `src-tauri/Cargo.toml`
  consumes the registry version directly; no sibling checkout required.

## [0.1.0] - TBD

Initial extraction.
