# Annotator application spike

This feature is a separate, minimal interface for human annotation. It does not
conditionally simplify the main Langfuse navigation.

The UI is driven by immutable `AnnotationViewSpec` versions. A spec may only
select from the trusted renderer catalog in `types.ts`: two layouts, three
evidence bindings, four response controls, and fixed submit behavior. It cannot
contain React, HTML, scripts, styles, URLs, JSON paths, or network actions.

The vertical slice intentionally reuses existing annotation queues and trace
read paths while treating legacy score configurations as an eventual output
adapter, not as the new authoring model. Submitted answers store the exact
workflow version that rendered the task.

Spike limitations: existing project RBAC still gates access, assignments remain
personalization rather than authorization, and there is no overlap,
adjudication, skip/flag persistence, or score projection yet.

To explore locally, run `pnpm run seed -- annotation-queue`, open the seeded
project's Annotation Studio, create a starter or AI draft, and publish it. The
seed creates queues and items but no published workflow. Until one is published,
the annotator route falls back to the legacy queue item UI.

Design handoff: the current Annotate entry is visible to users with queue read
permission, while starting and submitting work still require queue CUD
permission. A dedicated annotator permission model is needed before this can be
treated as a role-specific product. The queue home prioritizes assignments but
does not enforce them as access control.
