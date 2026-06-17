# ParentOS Spec Index

ParentOS product authority is organized by active domain. Kernel markdown files and typed tables under each domain carry product semantics; top-level domain files are reading guides.

## Active Product Domains

- `parentos`

## Repo Governance Domain

- `project` is the minimal canonical-tree and spec-placement shell for this repository. It does not carry ParentOS product behavior; ParentOS behavior remains under `parentos/kernel/**`.

## Reading Order

1. Start with the repo governance kernel index: [project/kernel/index.md](project/kernel/index.md).
2. Continue with the ParentOS domain kernel index: [parentos/kernel/index.md](parentos/kernel/index.md).
3. Read the referenced kernel contracts under `parentos/kernel/*.md`.
4. Use typed tables under `parentos/kernel/tables/*.yaml` for enumerations, registries, protocol surfaces, catalogs, and support registries.
5. Use top-level domain guides only as navigation aids.

## Non Product Surfaces

- `.nimi/contracts/**`, `.nimi/methodology/**`, and `.nimi/config/**` are host-local nimicoding projections created by CLI initialization or synchronization.
- `.nimi/topics/**` carries human topic lifecycle records and candidate planning context (when present).
- `.nimi/local/**` carries local operational and projection artifacts (not tracked product authority).
- Generated views are rendered on demand by nimicoding commands and are not tracked as product authority.
