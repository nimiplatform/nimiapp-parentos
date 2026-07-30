# Project Kernel Authority Map

This directory is the repo-level canonical-tree shell for this ParentOS host.

Normative project surfaces:

- `core-rules.md` governs spec placement, domain admission, and authority routing for this repository.
- `tables/rule-catalog.yaml` lists the stable project-level governance rules.

Authority boundary:

- ParentOS product behavior belongs in `.nimi/spec/parentos/kernel/*.md` and `.nimi/spec/parentos/kernel/tables/**`.
- `.nimi/spec/project/**` governs repository spec structure only; it does not define child growth, health, AI, storage, UI, reminder, report, or journal product behavior.
- `.nimi/contracts/**`, `.nimi/methodology/**`, and `.nimi/config/**` remain nimicoding-managed projection surfaces, not product authority.
- `.nimi/local/**` and `.nimi/topics/**` remain operational or lifecycle surfaces, not canonical product authority.
