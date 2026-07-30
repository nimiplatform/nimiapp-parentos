<!--
Thanks for contributing to ParentOS.

Before submitting, please confirm:

- [ ] Spec authority lives under `.nimi/spec/parentos/canonical/**`. If you
      changed a canonical unit or bound specialized artifact, you also ran the affected
      `pnpm check:*` script.
- [ ] No legacy/compat shims, no fallback that hides typed contract failures
      (see AGENTS.md "Hard Boundaries").
- [ ] No `apps/parentos/...` or `nimi-realm` paths reintroduced anywhere.
      All `@nimiplatform/*` deps come from npm; `nimi-shell-tauri` comes from crates.io.
-->

## Summary

<!-- 1-3 bullets on what this PR does and why. -->

## Spec / Authority changes

<!-- Name each changed canonical unit and any bound data/structured/parentos
     artifact. Otherwise write "None". -->

## Verification

<!-- Tick the ones you ran locally. -->

- [ ] `pnpm nimicoding:doctor`
- [ ] `pnpm spec:authority:check`
- [ ] `pnpm spec:authority:compile`
- [ ] `pnpm generate:knowledge-base`
- [ ] `pnpm check:spec-consistency`
- [ ] `pnpm check:knowledge-base`
- [ ] `pnpm check:knowledge-asset-governance`
- [ ] `pnpm check:nurture-mode-safety`
- [ ] `pnpm check:ai-boundary`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`

## Screenshots / Notes

<!-- If this changes UI, attach before/after. Otherwise delete this section. -->
