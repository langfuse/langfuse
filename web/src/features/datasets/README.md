# Datasets

## Surface and entry points

This feature owns dataset items, experiments, and the legacy comparison view.
Routes live under `pages/project/[projectId]/datasets`. The compare route creates
one `ActiveCellProvider` per project and dataset.

## State ownership

- tRPC owns dataset, run, item, and score query data. Router hooks own filters and
  selected runs.
- `contexts/ActiveCellContext.tsx` owns the active review target and its comment
  draft guard in a per-view store. Its select and clear actions are the only
  way to change review targets; both reject leaving an unfinished comment.
- `components/AnnotationPanel.tsx` owns the mounted review surface. Target identity
  controls remounting; refreshed scores and table changes preserve the draft.
  Panel visibility derives from the active target. Loading table data does not
  unmount the panel.
- The shared comments composer owns editable comment content and reports draft
  presence through `onDraftChange`. Reports are scoped to their target so a late
  callback cannot change another target's guard.
- `components/NewDatasetItemForm.tsx` prepares initial schema examples before
  mounting editable fields. Later dataset selections fill only empty, unedited
  fields; metadata refetches and obsolete generation results preserve drafts.
  Its opening source and callbacks belong to that form instance. Creating a
  dataset keeps the item draft and appends the created dataset to its targets.
- `components/submitDatasetItems.ts` owns immediate submission and its pending
  guard. Edits, repeated submits and dialog dismissal stay blocked until the
  request settles; errors preserve the draft. The dialog controller scopes
  completion callbacks to the instance that submitted them.
- `components/DatasetForm.tsx` owns dataset creation and updates, including its
  footer and pending state. Single and bulk item creation reuse it and receive
  pending/completion notifications directly from the submission event.

## Structure and consumers

`components/` contains dataset forms, tables, and review views. `hooks/` owns
query adapters; `contexts/` owns compare-view state; `lib/` and `utils/` contain
data preparation. `server/` owns tRPC procedures and persistence workflows.
Trace, observation, and session surfaces reuse the dataset-item dialog. Only the
legacy compare page and its cells consume the active-cell provider.

## Stability and migration

The provider exposes a stable store; reporting a comment draft does not rerender
comparison cells. All close paths, including the mobile sheet, use the same
guarded clear action. Query-string changes do not reset review state.

Run selection workflows remain in the compare page as a separate migration
boundary. Follow `frontend-large-feature-architecture` and
`refactor-react-effects` before extending their state ownership.
