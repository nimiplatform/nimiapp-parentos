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

ParentOS is the installed Nimi app identified only as `nimi.parentos`. The renderer MUST NOT construct or receive caller identity, app instance, device, launch host, release descriptor, nonce, Runtime endpoint, Realm URL, account projection, protected metadata, or any token/session material. Environment variables, argv, renderer configuration, and a generic Runtime bridge are not admitted sources for those values.

Electron and Tauri MUST bind the shared Kit installed host to the platform-native protected carrier. The renderer may construct `createInstalledNimiAppBootstrap` only from the artifact-only installed standard-shell surface. Runtime owns the opaque installed session and verifies the app, release, peer process, account generation, and Runtime epoch outside the renderer. Each platform is admitted independently; a platform without a verified native carrier remains fail-closed and MUST NOT fall back to localhost gRPC or a same-user daemon.

The complete ParentOS protected operation set is not yet admitted. Until it is admitted, bootstrap MUST:

1. construct the typed artifact-only installed standard-shell projection;
2. refuse to create a generic `Runtime`, `NimiClient`, Realm client, account caller, AI client, or app-owned session;
3. report `parentos-protected-operation-set-not-admitted` as a typed capability-unavailable state;
4. keep SQLite, media, app settings, account-scoped state, and product routes unopened.

ParentOS-owned SQLite and media remain durable app data, but their OS paths are location truth only, not admission or account truth. Each host derives fixed roots from its OS application-data API; env, argv, and user configuration cannot select those roots. After the protected ParentOS operation set is admitted, Runtime's opaque installed session and account generation MUST authorize local hydration before the host exposes app-domain data commands. No anonymous local fallback is admitted.

The exact future positive sequence is: native carrier session → Runtime-installed app/account binding → ParentOS operation-set admission → account-scoped local hydration → route render. The current artifact-only carrier and typed unavailable screen are transitional fail-closed surfaces, not evidence that the full ParentOS session is complete.

## PO-SHELL-008 Account Material Custody Boundary

ParentOS MUST NOT persist, project, or transit access tokens or refresh tokens at any layer (renderer, Tauri host, SQLite, OS keychain, or any other store). Runtime owns account and credential custody (spec K-ACCSVC-008 / R-OAUTH-008). Concretely:

- The desktop shell must not call `applyToken(accessToken, refreshToken)` or any equivalent that takes refresh-token material.
- The Tauri shared desktop auth-session bridge (`auth_session_load`/`save`/`clear`) must not be invoked from ParentOS bootstrap or login paths.
- The platform client's `refreshTokenProvider`, `accessTokenProvider`, `accessToken`, `subjectUserIdProvider`, and `sessionStore` inputs are forbidden. The installed-app SDK projection exposes no such ParentOS inputs.
- ParentOS does not construct a Realm client until a Realm-owned product feature is explicitly admitted. When direct Realm calls are later admitted, access tokens must be projected from Runtime account custody (short-lived, never persisted, never returned to ParentOS surfaces) and consumed through SDK Realm typed services / adapters.

ParentOS does not own embedded login, logout, OAuth browser brokering, loopback listeners, account projection, or account-control RPCs. Account login, logout, and switching are first-party Desktop / Runtime responsibilities. ParentOS receives only the scoped outcome of a future admitted installed session; it never opens an anonymous account scope.

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

After protected operation admission, the shell must support a single local family with multiple children inside each Runtime-authorized account-scoped local database.

- child create, edit, and delete flows operate on the local SQLite store
- authenticated account switches must revoke the prior installed session, clear in-memory family and child state, bind the new Runtime-authorized account generation, and only then reload that account's local rows
- one authenticated subject must not see another subject's local family, children, or app settings through shell state reuse
- while the protected ParentOS operation set is unadmitted, the app must not initialize SQLite or render these flows
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

- protected bootstrap failures must map to `login-required`, `runtime-unavailable`, `permission-denied`, `repair-required`, or `capability-unavailable`
- every protected failure state must keep local data locked and expose an actionable retry or Desktop/repair instruction
- renderer metadata, env, argv, app id, or a direct gRPC connection must not turn a failure into a positive session
- absence of the complete ParentOS protected operation set is `capability-unavailable`, not a production-ready carrier claim
- missing compiled knowledge-base artifacts is a startup failure
- route drift against `routes.yaml` is a verification failure, not a runtime fallback case
- malformed typed bridge payloads must raise an error instead of returning placeholder success objects
- missing nurture-mode parameters must not be patched with ad hoc values outside the spec-defined `balanced` default

## Exclusions

The following remain outside this contract:

- family collaboration and multi-account sharing (`PO-FEAT-030`)
- cloud sync or remote backup
- any use of the `ability-model` design asset as a frozen runtime contract
