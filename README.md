Current development dependencies are SDK 0.22.2, Kit/native 0.22.1, App Tools 0.14.0 and Nimi Coding 0.7.0. The checked-in pnpm lock resolves these packages from the public registry. Run `pnpm install --frozen-lockfile`, `pnpm exec nimi-app check`, then `pnpm dev` with a matching source-built Nimi Runtime and Home. App versions and published App releases are unchanged. Earlier versioned notes retain their original acceptance scope. Home uses the App-owned root `NIMI_APP.md`; this README remains developer documentation.

Upgrade verification: public-registry installation, frozen-lockfile installation, App Tools checks and the applicable type/Host build checks passed. Desktop-supervised macOS development opened the existing child profile and settings. New model-output journeys and packaged installation were not rerun; earlier evidence below retains its stated versions and scope.

[App introduction and usage](NIMI_APP.md)

# ParentOS (成长底稿)

> A private, local-first operating system for lifelong child development and family memories.

ParentOS helps parents record their child's growth measurements, milestone observations, and daily family moments. By combining structured developmental milestones with local-first privacy and non-diagnostic AI support, ParentOS gives families a safe, durable digital chronicle that remains 100% under their own ownership.

---

## Key Features

- **Growth & Measurement Tracking**: Record height, weight, head circumference, and physical metrics, and view trends against reference curves for supported ages and measurements (including WHO LMS standards). Percentiles indicate statistical reference positions, not health scores or medical diagnoses.
- **Family Field Notes & Milestones**: Capture daily anecdotes, breakthrough words, emotional shifts, and artwork. Organize observations across developmental stages from infancy through adolescence.
- **Thoughtful Parenting Advisor**: Have meaningful conversations with an AI parenting companion. Explore developmentally appropriate routines, communication tips, and empathetic encouragement without judgment or comparative ranking.
- **Lifelong Chronicle**: Revisit milestone timelines, search past memories, and export family growth summaries.

### The Safety & Privacy Boundary
- **100% Local Storage**: Structured records are stored in local SQLite (`rusqlite`), while photos and other media live in local media directories.
- **User-Selected AI Routing**: ParentOS has no cloud sync or remote backup. You can choose Local or Cloud routes independently for text generation and audio transcription. Local inference stays entirely on your device, whereas Cloud inference sends only the input needed for that specific request through Nimi Runtime to your selected provider.
- **Non-Diagnostic Principle**: AI suggestions offer general developmental context and parenting support; they never synthesize medical diagnoses or prescribe treatment plans.

---

## Technical Architecture

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron + Rust Data Sidecar | Native system lifecycle and fast, secure SQLite storage |
| **Frontend UI** | React 19 + Vite + Tailwind CSS | Fluid, accessible user interface built on `@nimiplatform/kit` |
| **Local Database** | Embedded SQLite (`rusqlite`) | Structured data, growth curves, and observation logs |
| **AI Routing** | Nimi Runtime (`text.generate`, `audio.transcribe`) | Ready local models or user-configured cloud connectors |

---

## Getting Started & Development

### Prerequisites
- Node.js ≥ 24, pnpm ≥ 10
- Stable Rust & Cargo (for the SQLite sidecar)
- Nimi Desktop running locally

### Running in Development

> The current source uses the published SDK 0.21.0, Kit/native 0.21.0, App Tools 0.13.0, and Nimi Coding 0.6.5. Dependencies resolve directly from public registries without local archive overrides. Run `pnpm install --frozen-lockfile` to install the locked versions. Earlier release checks below apply only to their recorded dependency combinations.

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Start in Desktop-supervised Electron shell
pnpm dev
```

### Build & Verification
```bash
# Typecheck, bundle, and cargo check
pnpm build

# Run unit tests
pnpm test

# Verify specification consistency and governance rules
pnpm check:spec-consistency
pnpm check:ai-boundary
```

---

## Data Storage Locations

- **macOS**: `~/Library/Application Support/Nimi/ParentOS/`
- **Windows**: `%APPDATA%/Nimi/ParentOS/`

ParentOS uses its own local data directory. Before uninstalling or changing devices, create a local backup and keep it somewhere safe.

---

## Release & Verification Status

- **Verified Publisher Release**: [v0.1.9](https://github.com/nimiplatform/nimiapp-parentos/releases/tag/v0.1.9)
- **Registry Admission**: [#83](https://github.com/nimiplatform/nimi-app-registry/pull/83) (macOS arm64 and Windows x64)
- **Recorded Toolchain Combination**: SDK 0.21.0, Kit/native 0.19.3, App Tools 0.12.1, Nimi Coding 0.6.5
- **Previously Recorded Platform Checks**: macOS arm64 Catalog install, synthetic child profile creation, local-model developmental advisor turn, SQLite persistence, and cold start recovery verified against Nimi Home. (Windows GUI execution marked as `NOT-VERIFIED`).

**Local chrome teardown patch — 2026-10-26.** The explicit `pnpm-workspace.yaml` override selects the complete Kit 0.21.1 development archive at `.nimi/local/platform-icons/nimiplatform-kit-0.21.1-chrome.tgz`. It backports canonical fix `6b3ef1116` onto published Kit 0.21.0: window/WebContents destruction cleanup is idempotent and never reads a destroyed BrowserWindow getter. SDK 0.21, public chrome declarations and native carrier dependencies retain their existing versions. This archive is unpublished; clean development checkouts need the same complete archive, and production preflight still requires registry resolutions. App-specific business journeys and Windows interaction with this patch remain NOT-VERIFIED.
