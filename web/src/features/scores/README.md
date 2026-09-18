# Scores

Score rendering, annotation forms, mutations, and the project Scores search bar.

## Annotation ownership

`AnnotationForm` mounts single-target forms; `DualAnnotationContent` combines a
trace and observation. Trace/session detail, annotation queues, and dataset
comparison supply their targets and scores. The adapters prepare data and gate
the form on score-config readiness. Target identity keys the mounted form;
refetches of the same target preserve its draft.

| Owner                                                          | Responsibility                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/AnnotationForm.tsx`                                | Loaded-data boundary, form lifetime, selected row structure, header and picker composition.                                                                                                                    |
| `lib/prepareAnnotationFormData.ts`                             | Pure construction of initial scored and remembered empty fields.                                                                                                                                               |
| React Hook Form                                                | The mounted form's draft values and validation. Each `AnnotationScoreRow` subscribes to its own row and provides that scoped form state to input primitives.                                                   |
| `actions/annotationFormActions.ts`                             | Create/update/clear/comment workflows, current draft reads, target-specific analytics, optimistic form updates, and operation-owned rollback.                                                                  |
| `state/annotationSaveStore.ts`                                 | Per-mount pending/error/confirmed-save state. `AnnotationSaveStatus` subscribes independently of the header; row actions subscribe only to whether a save is pending. Drafts are not duplicated in this store. |
| `hooks/useScoreMutations.ts`                                   | tRPC mutation bridge and optimistic shared score-cache writes/rollback. Server/query state remains in tRPC.                                                                                                    |
| `lib/annotationConfigSelection.ts`, `hooks/useScoreConfigs.ts` | Config query data, explicit selection changes, and remembered empty-config choices for each target type.                                                                                                       |
| `components/AnnotationScoreRow.tsx`                            | Value-control presentation, mount-local score-comment draft, and DOM focus deferral while opening its clear menu.                                                                                              |
| `hooks/useAnnotationKeyboard.ts`                               | Browser keyboard integration, reading current rows only when a key is pressed.                                                                                                                                 |

Actions resolve a row by target + config both at invocation and async completion.
The client-only target key never enters score API payloads. Mutation promise
completion owns form rollback, since a later mutation replaces per-call observer
callbacks. Each form owns one action instance and one save store; unrelated forms
cannot share drafts or save status. Existing score cache scope and API payloads
remain owned by the mutation bridge.

Typing updates the owning row and save-status subscriber. It must not rebuild the
header, picker, other rows, or keyboard listeners. Changing field selection may
rerender the row structure. Score-comment popovers seed drafts on mount; closing
discards that local draft. Clear cancels deferred autosave, while dismissing the
clear menu commits the deferred edit. Numeric validation reads native `badInput`
on every input event before interpreting an empty value as a deliberate clear.

## Effect inventory

| Location                                 | External system / lifecycle                                                         | Status                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `AnnotationFormContent`                  | Analytics session opens on mount and closes on unmount, using current field counts. | Retained; stable action-owner dependency.                                    |
| `useAnnotationKeyboard` keydown listener | Window keyboard events for row navigation and score selection.                      | Retained; symmetric registration/cleanup, current values read at event time. |
| `useAnnotationKeyboard` capture listener | Escape focus handling before the parent drawer's capture listener.                  | Retained; symmetric registration/cleanup.                                    |
| Score-comment editor                     | No external system: draft was mirrored from `savedComment`.                         | Removed; popover mount seeds the editor.                                     |

No other direct effects exist in this feature. Query, cache, and local-storage
hooks keep their existing external ownership. The shared `ScoreCacheProvider`
still exposes changing cache snapshots to its consumers; narrowing subscriptions
there is a separate migration across score-rendering surfaces. Table column and
aggregate hooks are outside the annotation form's lifetime.

Before extending this boundary, read the `frontend-large-feature-architecture`,
`refactor-react-effects`, and `posthog-instrumentation` skills. Keep new workflows
in actions and pure preparation in `lib`; do not add a query-to-draft sync effect
or a second store for the same input value.

## Scores search

- `components/ScoresSearchBar.tsx` owns the shared composer's lifecycle. It
  edits the table's existing sidebar filter state; the only local state is the
  shared editor's draft. It uses the table's filter-option response.
- `constants/scoresSearchRegistry.ts` derives the grammar from the Scores
  sidebar's facets, excluding parent-owned fields in scoped tables. Bare text
  searches within score names; exact selections,
  numeric ranges, boolean values, and categorical values retain their existing
  filter shapes. There is no independent full-text search or aggregate-score
  namespace.
- `components/table/use-cases/scores.tsx` (under `src/`) owns data fetching,
  URL/saved-view filters, and the table. Sidebar tables share the bar and pass
  their filter configuration so the grammar matches their available facets.

The shared grammar and extension contract live in `features/search-bar/README.md`.
