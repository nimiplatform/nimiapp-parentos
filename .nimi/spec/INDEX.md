# ParentOS Spec Index

ParentOS product authority is organized by active domain. Kernel markdown files and typed tables under each domain carry product semantics; top-level domain files are reading guides.

## Active Product Domains

- `parentos`

## Reading Order

1. Start with the domain kernel index: [parentos/kernel/index.md](parentos/kernel/index.md).
2. Read the referenced kernel contracts under `parentos/kernel/*.md`.
3. Use typed tables under `parentos/kernel/tables/*.yaml` for enumerations, registries, protocol surfaces, catalogs, and support registries.
4. Use top-level domain guides only as navigation aids.

## Non Product Surfaces

- `.nimi/contracts/**`, `.nimi/methodology/**`, and `.nimi/config/**` are host-local nimicoding projections created by CLI initialization or synchronization.
- `.nimi/topics/**` carries human topic lifecycle records and candidate planning context (when present).
- `.nimi/local/**` carries local operational and projection artifacts (not tracked product authority).
- Generated views are rendered on demand by nimicoding commands and are not tracked as product authority.
