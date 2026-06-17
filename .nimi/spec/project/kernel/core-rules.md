# Project Core Rules

## PROJECT-SPEC-001 Product Authority Routing

ParentOS product behavior authority belongs only in `.nimi/spec/parentos/kernel/*.md` and `.nimi/spec/parentos/kernel/tables/**`. The project kernel governs repo-level spec placement and canonical-tree completion only.

## PROJECT-SPEC-002 Domain Admission

Every top-level domain under `.nimi/spec/<domain>` requires explicit admission in `.nimi/contracts/domain-admission.schema.yaml` before any file in that domain is used as authority.

## PROJECT-SPEC-003 Table Family Gate

Every `.nimi/spec/<domain>/kernel/tables/*.yaml` file requires a declared table family before it is accepted as a product authority table or support registry.

## PROJECT-SPEC-004 Projection Boundary

`.nimi/contracts/**`, `.nimi/methodology/**`, and `.nimi/config/**` are nimicoding-managed projection surfaces. They can define validation contracts and workflow mechanics, but they do not override domain product authority.

## PROJECT-SPEC-005 Local State Boundary

`.nimi/local/**` and `.nimi/topics/**` can provide operational evidence, lifecycle records, audit outputs, and candidate planning context. They cannot promote semantic authority without an admitted change to `.nimi/spec/**`.
