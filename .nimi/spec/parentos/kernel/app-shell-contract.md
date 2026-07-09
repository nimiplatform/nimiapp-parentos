# App Shell Contract

> Owner Domain: `PO-SHELL-*`

## Scope

This contract governs the current ParentOS desktop shell baseline: bootstrap, route registration, navigation exposure, child selection, and settings surfaces.

Covered features from `feature-matrix.yaml`:

- `PO-FEAT-009` nurture mode settings
- `PO-FEAT-042` reminder frequency settings
- `PO-FEAT-043` AI model/runtime settings
- `PO-FEAT-057` app language preference

Governing fact sources:

- `tables/routes.yaml`
- `tables/nurture-modes.yaml`
- `tables/local-storage.yaml#storage_layout`
- `tables/local-storage.yaml#families`
- `tables/local-storage.yaml#children`
- `tables/local-storage.yaml#app_settings`

## PO-SHELL-001 Bootstrap Order

ParentOS is a desktop-launched installed Nimi app submitted through `nimi.app.yaml`. The desktop shell bootstrap MUST construct its platform client through the active SDK installed-app projection: a host-owned installed app launch binding, a host-owned standard shell surface, `createInstalledNimiAppBootstrap`, and then `createNimiClient` wrapped around the SDK Runtime surface. Tauri and Electron desktop shells implement this admitted SDK path through trusted host providers; the renderer consumes only the installed app launch binding, the standard shell surface, and the SDK Runtime transport. App session metadata and protected access metadata are produced by the host provider and are not returned to renderer code. This path must type-reject app-owned access tokens, refresh tokens, subject providers, and session stores; RuntimeAccountService is the sole owner of account custody, login broker, app session, and scoped/protected access metadata projection.

Caller identity for runtime-account RPCs:

| Field | Value |
|---|---|
| `mode` | `ACCOUNT_CALLER_MODE_DESKTOP_LAUNCHED_NIMI_APP` |
| `appId` | `nimi.parentos` |
| `appInstanceId` | `nimi.parentos.desktop-installed` unless the installed app host projects a concrete instance id |
| `deviceId` | `desktop-installed-app` unless the installed app host projects a concrete device id |
| `launchHostId` | `desktop-electron-installed-app-host` |
| `releaseDescriptorRef` | `nimi.parentos.bundled-with-nimi` unless the installed app host projects a concrete release descriptor |

`nimi.parentos` is the single canonical Nimi App id across Runtime, SDK, AIConfig, app storage, submitted app identity, and the Tauri bundle identifier. Pre-cutover app-prefixed and OS-bundle-prefixed identifiers are not admitted and must not be used as caller ids, storage app ids, Tauri identifiers, AIConfig scope owners, or any other app identity.

`ACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP` and `ACCOUNT_CALLER_MODE_DESKTOP_LAUNCHED_AVATAR` are not admitted for ParentOS after the installed-app hard cut. Local development uses the same installed-app binding shape with dev-projected storage roots and launch nonce; it must not reintroduce developer-registration account semantics.

ParentOS must not mutate Runtime developer-registration config from app bootstrap. Installed app metadata uses the submitted app identity and `developerRegistration=false`; local development remains a host launch-mode concern expressed through host-projected installed app binding inputs, not app-owned Runtime policy.

The desktop shell bootstrap path must execute in this order:

1. resolve the host-projected installed app launch binding, including realm base URL, app instance, device, launch host, nonce, and release descriptor
2. construct the installed app Runtime projection through `createInstalledNimiAppBootstrap` and the host-owned standard shell surface, then wrap the resulting Runtime in `createNimiClient` (Runtime owns login custody and protected access metadata projection; host providers inject app session and protected access metadata without returning token material to ParentOS renderer code)
3. prepare ParentOS Nimi Data storage from the host-bound installed app standard data root projection for `nimi.parentos` and grant the returned durable data root to the Tauri asset scope
4. resolve the current local storage scope from `runtime.account.getAccountSessionStatus().accountProjection.accountId` when authenticated; use the anonymous local scope when runtime returns `ANONYMOUS` / `UNAVAILABLE`
5. initialize the SQLite-backed local storage for that scope under `tables/local-storage.yaml#storage_layout`
6. load family, child, and app-setting rows from the scoped local storage
7. derive the active child from persisted local state or the first available child
8. render shell routes after local prerequisites are ready

Bootstrap is local-first but not app-storage-optional. ParentOS must not require cloud hydration before local family and child data become usable, but the installed app launch binding and the host-bound standard data root projection for `nimi.parentos` are hard prerequisites because local SQLite and user-generated media roots are governed by `tables/local-storage.yaml#storage_layout`. Authenticated sessions must switch into that subject's dedicated local database before shell data is hydrated. Runtime account states `anonymous` and `unavailable` must NOT cause bootstrap failure after the storage projection is available — ParentOS opens against the anonymous local scope and waits for a successful runtime broker login before switching scope. Installed app launch binding failure, app-storage projection failure, or SQLite initialization failure MUST fail bootstrap rather than render a shell backed by an unowned path or missing local store.

## PO-SHELL-008 Account Material Custody Boundary

ParentOS MUST NOT persist, project, or transit access tokens or refresh tokens at any layer (renderer, Tauri host, SQLite, OS keychain, or any other store). Runtime owns refresh-token custody (spec K-ACCSVC-008 / R-OAUTH-008). Concretely:

- The desktop shell must not call `applyToken(accessToken, refreshToken)` or any equivalent that takes refresh-token material.
- The Tauri shared desktop auth-session bridge (`auth_session_load`/`save`/`clear`) must not be invoked from ParentOS bootstrap or login paths.
- The platform client's `refreshTokenProvider`, `accessTokenProvider`, `accessToken`, `subjectUserIdProvider`, and `sessionStore` inputs are forbidden. The admitted installed-app SDK projection path exposes no such ParentOS inputs.
- ParentOS does not construct a Realm client until a Realm-owned product feature is explicitly admitted. When direct Realm calls are later admitted, access tokens must be projected from Runtime account custody (short-lived, never persisted, never returned to ParentOS surfaces) and consumed through SDK Realm typed services / adapters.

ParentOS does not own embedded login, logout, OAuth browser brokering, loopback listeners, or account-control RPCs. Account login, logout, and switching are first-party Desktop / Runtime account-surface responsibilities. ParentOS may read the current account projection through the installed app Runtime caller after bootstrap; when no authenticated projection is available, it opens the anonymous local scope.

## PO-SHELL-002 Route Registration

Route registration must be a strict projection of `tables/routes.yaml`.

- every route listed in `routes.yaml` must be registered in `routes.tsx`
- every route registered in `routes.tsx` must exist in `routes.yaml`
- current registered surfaces include `/reports`, `/profile`, `/settings/reminders`, and `/settings/ai`; retired `/profile/*` child shells may remain registered only as redirects to `/profile`
- only routes marked `nav: true` in `routes.yaml` may appear in shell navigation
- hidden, orphan, or experimental pages are not admitted shell surfaces until they are added to `routes.yaml`

## PO-SHELL-003 Typed Shell State

The shell-level state required for the current baseline is:

| Field | Type | Invariant |
|---|---|---|
| `familyId` | `string \| null` | `null` only when no local family exists yet in the current local storage scope |
| `children` | `ChildRecord[]` | rows are projected from `local-storage.yaml#children` without dropping required fields |
| `activeChildId` | `string \| null` | must reference an item in `children` when not `null` |
| `nurtureMode` | `relaxed \| balanced \| advanced` | value must come from `nurture-modes.yaml` |
| `nurtureModeOverrides` | `Record<string, NurtureMode> \| null` | domains must align with spec-governed knowledge domains |

JSON-backed child fields such as `nurtureModeOverrides`, `allergies`, `medicalNotes`, and `recorderProfiles` must be parsed and serialized through typed bridge mappers.

## PO-SHELL-004 Nurture Mode Persistence

Nurture mode settings are child-scoped and must round-trip through the `children` table.

- `nurtureMode` is required and defaults to `balanced` only when a record is first created with the field absent
- `nurtureModeOverrides` is optional JSON text and may only override domains supported by the current app
- nurture mode may change reminder visibility and AI detail for `P1-P3` items
- nurture mode must never weaken `P0` delivery or safety thresholds

## PO-SHELL-005 Family and Child Selection

The shell must support a single local family with multiple children inside each account-scoped local database.

- child create, edit, and delete flows operate on the local SQLite store
- authenticated account switches must clear in-memory family and child state, switch to the new subject-scoped SQLite database, and then reload that account's local rows
- one authenticated subject must not see another subject's local family, children, or app settings through shell state reuse
- switching the active child refreshes profile, timeline, journal, advisor, and reports views from that child's local records
- deleting a child must rely on storage-layer cascade behavior for dependent rows

## PO-SHELL-006 Settings Surfaces

Current settings authority includes:

- `/settings/children` for child CRUD
- `/settings/nurture-mode` for nurture-mode and per-domain overrides
- `/settings/reminders` for reminder frequency override management
- `/settings/ai` for ParentOS model/runtime preferences
- `/settings` for app language preference, persisted in `app_settings`

Settings state must round-trip through `children` or `app_settings`. The shell must not invent shadow config stores outside those admitted persistence paths.

## PO-SHELL-007 Fail-Close Behavior

The shell must fail closed when spec-governed prerequisites are invalid.

- missing compiled knowledge-base artifacts is a startup failure
- route drift against `routes.yaml` is a verification failure, not a runtime fallback case
- malformed typed bridge payloads must raise an error instead of returning placeholder success objects
- missing nurture-mode parameters must not be patched with ad hoc values outside the spec-defined `balanced` default

## Exclusions

The following remain outside this contract:

- family collaboration and multi-account sharing (`PO-FEAT-030`)
- cloud sync or remote backup
- any use of the `ability-model` design asset as a frozen runtime contract
