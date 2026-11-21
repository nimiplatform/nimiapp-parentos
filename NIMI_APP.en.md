# ParentOS User Guide

Welcome to ParentOS! ParentOS is a local-first child growth companion for families, bringing physical measurements, age-based stage reminders, everyday observations, and structured growth reports together into a long-term record owned by your household.

ParentOS is available in both **Desktop (Windows x64 / macOS arm64)** and **Hosted Web** editions. The Desktop app installs and runs under Nimi Home directly on your computer. The Web edition signs in with your official Nimi account and connects directly to your bound primary PC Runtime so you can view and record entries from a browser without installing Runtime on the secondary device.

---

## Core Features & Getting Started

### 1. Child Profiles & Age-Based Reminders
- Launch ParentOS from Nimi Home on Desktop (or open the Web edition) and create a child profile with birth date and baseline measurements.
- Multi-child households can create separate profiles and switch active children anytime from the bottom-left child switcher.
- The Home timeline highlights recent changes, age-matched quick links, today's and next-7-day stage to-dos, and observation prompts. Adjust reminder depth under **Settings → Nurture mode** (`relaxed`, `balanced`, or `advanced`); essential safety and core schedule reminders remain active in every mode.

### 2. Health Record Console & Growth Reference Curves
- Track height, weight, head circumference, vision, sleep, weekly outdoor goals, dental, vaccines, allergies, and developmental milestones in one unified profile console.
- Inspect long-term trends on the **Growth curve** view against supported reference curves (China standard and WHO standard). Reference percentiles indicate statistical position only and are not health grades or clinical diagnoses.

### 3. Growth Journal & Structured Reports
- Capture everyday moments with notes, photos, voice transcription, keepsake flags, and observation tags.
- Review periodic local structured reports under **Reports**; when an AI text model is configured, you can also generate narrative summaries grounded in your recorded facts.

### 4. Growth Advisor & AI Model Routing
- Ask everyday parenting questions in **Advisor** grounded in your child's recent local records and reviewed reference domains.
- Open **Settings → AI settings** to independently choose a **Local** or **Cloud** route for **Text generation** (`text.generate`) and **Audio transcription** (`audio.transcribe`). When no AI model is configured or available, all local profile, curve, reminder, and journal features continue to work independently.
- **Non-diagnostic boundary**: AI responses are strictly for everyday parenting reflection and general context. ParentOS never provides clinical diagnoses, mental health evaluations, comparative child rankings, medication guidance, or treatment plans. Always consult a qualified professional when you have questions about your child's health or development.

### 5. Navigation & Unsaved Draft Protection
- Use Back and Forward navigation to revisit screens without automatically re-triggering AI calls.
- Leaving the journal or switching children with an unsaved draft prompts you to **Save and leave**, **Discard changes**, or **Keep editing**.

---

## Connecting via Hosted Web

1. Keep Nimi Home and your primary PC Runtime running online with your Nimi account bound and remote access enabled.
2. Open ParentOS from the [Nimi App Storefront](https://nimi.ai/apps/parentos) or [parentos.nimi.xyz](https://parentos.nimi.xyz/), sign in with your Nimi account, and connect to your primary PC Runtime.
3. On first use from that Web origin, review and approve the application and origin in Nimi Home on your primary PC (**Settings → Account Security → Remote access**).
4. After closing or refreshing your browser, reconnect with the same account and primary PC to read back your saved family records.

---

## Privacy, Data Handling & Current Limitations

- **Desktop local storage**: Desktop stores child profiles, health records, journals, reports, and advisor conversations in a device-local SQLite database, with photos, audio, and attachments stored in the app's local data directory (no cloud sync or remote backup):
  - **Windows**: `%APPDATA%/Nimi/ParentOS/`
  - **macOS**: `~/Library/Application Support/Nimi/ParentOS/`
  - Files remain on your device after uninstalling Nimi and are managed by ParentOS. Deleting a child under **Child management** cascades across associated records and app-managed media.
- **Web primary-PC managed storage**: The Web edition has no cloud business database. Structured records and media are stored directly inside your bound primary PC Runtime's managed app storage over an end-to-end connection. Desktop and Web currently use separate local storage roots and do not automatically merge.
- **User-chosen AI routing**: A **Local** route processes prompts and audio entirely on your primary PC. A **Cloud** route sends only the bounded request input (relevant record summaries, prompt text, or audio clip) through Nimi Runtime to the connector and provider you configured, subject to that provider's terms and pricing.
- **Current limitations**:
  - Full `.parentos` local archive backup and restore is available on Desktop only. Exported archives are unencrypted; store them in a trusted offline location before switching devices.
  - Checkup report and dental photo OCR extraction is not yet available.
  - Native desktop packages currently target Windows x64 and macOS arm64. Hosted Web requires your primary PC to remain online and reachable.
  - The app interface supports both Chinese and English; parts of the built-in stage reminder and observation rule catalog are currently authored primarily in Chinese.

---

## Help & Feedback

[Homepage](https://github.com/nimiplatform/nimiapp-parentos) · [Issue Tracker](https://github.com/nimiplatform/nimiapp-parentos/issues) · [Nimi Storefront](https://nimi.ai/apps/parentos)
