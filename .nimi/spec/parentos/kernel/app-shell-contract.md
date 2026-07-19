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

Electron and Tauri MUST bind the shared Kit local-app host to the platform-native protected carrier for Nimi-owned operations. Runtime owns that opaque carrier session and verifies the app, release, peer process, account generation, and Runtime epoch outside the renderer. Each platform is admitted independently; a platform without a verified native carrier MUST keep protected Nimi features unavailable and MUST NOT fall back to localhost gRPC or a same-user daemon.

ParentOS SQLite, media, settings, routes, and exact native product commands are `app_owned_authority`, not a ParentOS-wide Nimi permission gate. Their availability MUST NOT create a manifest permission, user prompt, grant row, synthetic scope, or Runtime admission decision. The native host derives fixed roots from its OS application-data API; env, argv, renderer input, and user configuration cannot select those roots. Canonical-path, escape, symlink, quota, schema, and exact renderer-origin checks remain mandatory app-host enforcement.

Renderer-to-native media writes MUST reject encoded payloads before decode when their maximum decoded size cannot fit, then re-check the decoded object size. Images are limited to 25 MiB per object, journal audio to 64 MiB per object, and the complete durable ParentOS data partition to 2 GiB when admitting a media write. All media entry points share one native quota lock, reject symbolic-link or non-regular partition entries, account for replacement size, and persist through a same-directory temporary file plus atomic replacement so rejection or write failure leaves no partial target.

The local product bootstrap sequence is:

1. bind the exact Electron or Tauri app host and fixed OS app-data roots;
2. register only the enumerated ParentOS-owned native commands alongside Kit's bounded local-app carrier;
3. initialize the device-local ParentOS SQLite database, media roots, and app settings;
4. hydrate family/child state and render the spec-registered product routes;
5. when a feature crosses into Runtime, Realm, Agent, Cognition, another app, or an external file, evaluate that feature's canonical permission, one-shot consent, or service entitlement independently.

ParentOS MUST refuse to create a generic `Runtime`, `NimiClient`, Realm client, account caller, AI client, or renderer-owned session merely to open app-owned data. Runtime or permission unavailability disables only the affected protected feature; it does not lock SQLite or product routes. A failure of the fixed native data host, canonical root, SQLite schema, or migration may lock local data because those are actual prerequisites of the app-owned store.

## PO-SHELL-008 Account Material Custody Boundary

ParentOS MUST NOT persist, project, or transit access tokens or refresh tokens at any layer (renderer, Tauri host, SQLite, OS keychain, or any other store). Runtime owns account and credential custody (spec K-ACCSVC-008 / R-OAUTH-008). Concretely:

- The desktop shell must not call `applyToken(accessToken, refreshToken)` or any equivalent that takes refresh-token material.
- The Tauri shared desktop auth-session bridge (`auth_session_load`/`save`/`clear`) must not be invoked from ParentOS bootstrap or login paths.
- The platform client's `refreshTokenProvider`, `accessTokenProvider`, `accessToken`, `subjectUserIdProvider`, and `sessionStore` inputs are forbidden. The installed-app SDK projection exposes no such ParentOS inputs.
- ParentOS does not construct a Realm client until a Realm-owned product feature is explicitly admitted. When direct Realm calls are later admitted, access tokens must be projected from Runtime account custody (short-lived, never persisted, never returned to ParentOS surfaces) and consumed through SDK Realm typed services / adapters.

ParentOS does not own Nimi embedded login, logout, OAuth browser brokering, loopback listeners, account projection, or account-control RPCs. Nimi account login, logout, and switching are first-party Desktop / Runtime responsibilities and affect only Nimi-owned features. The current ParentOS product opens its device-local app-owned data without a Nimi account. Any future account-partitioned local store must be an explicit ParentOS product partition or an opaque host-projected base entitlement; it must not be inferred from renderer-supplied Nimi identity material.

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

The shell supports a single local family with multiple children inside the active ParentOS-owned local database.

- child create, edit, and delete flows operate on the local SQLite store
- current bootstrap uses the device-local partition and requires no Nimi permission or Nimi account
- a future ParentOS-owned account partition switch must clear in-memory family and child state, bind the exact new app partition, and only then load its rows
- a Nimi account switch invalidates protected Nimi feature state but MUST NOT silently select, merge, expose, or delete ParentOS local partitions
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

- app-data bootstrap failures map to `app-data-unavailable` or `app-data-repair-required`, keep the app-owned store closed, and expose an actionable retry or repair instruction
- a protected Nimi feature failure remains local to that feature and MUST NOT clear, lock, or relabel app-owned family data as permission-denied
- renderer metadata, env, argv, display app id, or a direct gRPC connection must not turn a protected feature failure into a positive Nimi session
- a missing public permission or service entitlement is typed unavailable/denied for the affected feature, not a ParentOS-wide capability gate
- missing compiled knowledge-base artifacts is a startup failure
- route drift against `routes.yaml` is a verification failure, not a runtime fallback case
- malformed typed bridge payloads must raise an error instead of returning placeholder success objects
- missing nurture-mode parameters must not be patched with ad hoc values outside the spec-defined `balanced` default

## Exclusions

The following remain outside this contract:

- family collaboration and multi-account sharing (`PO-FEAT-030`)
- cloud sync or remote backup
- any use of the `ability-model` design asset as a frozen runtime contract
