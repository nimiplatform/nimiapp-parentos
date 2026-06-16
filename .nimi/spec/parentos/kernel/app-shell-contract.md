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

ParentOS is a non-first-party developer-registered local Nimi App Runtime account/session consumer. The desktop shell bootstrap MUST construct its platform client through the active SDK Runtime local-developer projection path proven by `apps/tester`: an account `Runtime` registered with `createNimiDeveloperRegisteredRuntimeAccountCaller`, `createNimiRuntimeFullAppRegistration`, and `createNimiRuntimeAppSessionMetadataProvider`, then an app `Runtime` wrapped by `createNimiClient`. This path must type-reject app-owned access tokens, refresh tokens, subject providers, and session stores; RuntimeAccountService is the sole owner of account custody, login broker, app session, and scoped/protected access metadata projection.

Caller identity for runtime-account RPCs:

| Field | Value |
|---|---|
| `mode` | `ACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP` |
| `appId` | `nimi.parentos` |
| `appInstanceId` | `nimi.parentos.local-developer` |
| `deviceId` | `parentos-local-developer-device` |

`nimi.parentos` is the single canonical Nimi App id across Runtime, SDK, AIConfig, app storage, submitted app identity, and the Tauri bundle identifier. Pre-cutover app-prefixed and OS-bundle-prefixed identifiers are not admitted and must not be used as caller ids, storage app ids, Tauri identifiers, AIConfig scope owners, or any other app identity.

`ACCOUNT_CALLER_MODE_DESKTOP_LAUNCHED_AVATAR` is not admitted for ParentOS — runtime treats that mode as binding-only avatar, not as a first-class account consumer.

Local development builds may set `developerRegistration=true` on `RegisterApp` through the SDK helper so an unshipped ParentOS app can be admitted when the Runtime developer-registration gate is already enabled. Production builds must leave developer registration false and follow normal Nimi App registry admission. ParentOS must not mutate Runtime developer-registration config from app bootstrap; that gate is a Runtime/Desktop developer-mode control, not app-owned policy.

The desktop shell bootstrap path must execute in this order:

1. resolve runtime defaults (realm base URL, transport)
2. construct and register the local-developer Runtime projection through active SDK Runtime helpers (`createNimiDeveloperRegisteredRuntimeAccountCaller`, `createNimiRuntimeFullAppRegistration`, `createNimiRuntimeAppSessionMetadataProvider`) and wrap the resulting app Runtime in `createNimiClient` (Runtime owns login custody and protected access metadata projection; ParentOS does not pass or receive token material)
3. prepare ParentOS Nimi Data storage by resolving `Runtime.GetAppStorage(nimi.parentos)` and granting the returned durable data root to the Tauri asset scope
4. resolve the current local storage scope from `runtime.account.getAccountSessionStatus().accountProjection.accountId` when authenticated; use the anonymous local scope when runtime returns `ANONYMOUS` / `UNAVAILABLE`
5. initialize the SQLite-backed local storage for that scope under `tables/local-storage.yaml#storage_layout`
6. load family, child, and app-setting rows from the scoped local storage
7. derive the active child from persisted local state or the first available child
8. render shell routes after local prerequisites are ready

Bootstrap is local-first but not Runtime-storage-optional. ParentOS must not require cloud hydration before local family and child data become usable, but Runtime app registration and `Runtime.GetAppStorage(nimi.parentos)` projection are hard prerequisites because local SQLite and user-generated media roots are governed by `tables/local-storage.yaml#storage_layout`. Authenticated sessions must switch into that subject's dedicated local database before shell data is hydrated. Runtime account states `anonymous` and `unavailable` must NOT cause bootstrap failure after the storage projection is available — ParentOS opens against the anonymous local scope and waits for a successful runtime broker login before switching scope. Runtime app registration failure, app-storage projection failure, or SQLite initialization failure MUST fail bootstrap rather than render a shell backed by an unowned path or missing local store.

## PO-SHELL-008 Account Material Custody Boundary

ParentOS MUST NOT persist, project, or transit access tokens or refresh tokens at any layer (renderer, Tauri host, SQLite, OS keychain, or any other store). Runtime owns refresh-token custody (spec K-ACCSVC-008 / R-OAUTH-008). Concretely:

- The desktop shell must not call `applyToken(accessToken, refreshToken)` or any equivalent that takes refresh-token material.
- The Tauri shared desktop auth-session bridge (`auth_session_load`/`save`/`clear`) must not be invoked from ParentOS bootstrap or login paths.
- The platform client's `refreshTokenProvider`, `accessTokenProvider`, `accessToken`, `subjectUserIdProvider`, and `sessionStore` inputs are forbidden. The admitted active SDK Runtime projection path exposes no such ParentOS inputs.
- ParentOS does not construct a Realm client until a Realm-owned product feature is explicitly admitted. When direct Realm calls are later admitted, access tokens must be projected from Runtime account custody (short-lived, never persisted, never returned to ParentOS surfaces) and consumed through SDK Realm typed services / adapters.

Login flows MUST go through the kit's `runtimeAccountBroker` path with the realm OAuth authority endpoints (`R-OAUTH-002`); the kit/Desktop never observes the realm OAuth `code`'s exchanged tokens. The browser-based login `desktopBrowserAuth.runtimeAccountBroker` is the single admitted entry point for ParentOS desktop login.

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
