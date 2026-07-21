# Lazy JSON renderer (`lazy/react/`)

The React layer over the lazy JSON seam (`../rowModel.ts`). Built **once**
against the async `RowModel`, so it renders an in-memory value today and a
Worker-backed ~1 GB stream tomorrow with no change. See
`../../LAZY_TREE_DESIGN.md` for the full engine→source→model→renderer picture.

## Owner map

| File | Role |
| --- | --- |
| `rowModelStore.ts` | Per-mount vanilla Zustand store. Owns the `RowModel` lifecycle and **all** async actions (`init`, `ensureRange`, `toggle`, `loadMore`, `materialize`, `dispose`). A generation token abandons work from a previous document or after teardown. This is where logic lives. |
| `LazyJsonViewer.tsx` | Controller / in-memory entry. Creates the store, builds the model over `value` in the feature's **one** effect (an external-engine lifecycle boundary), and gates render (spinner → list). |
| `LazyJsonList.tsx` | Virtualized body (`@tanstack/react-virtual`). Positions row shells, reads rows from the store's per-revision cache, and reports the visible range back via the virtualizer's `onChange` — the external event that drives windowed loading. Owns no document state. |
| `LazyJsonRow.tsx` | View-only row. Receives one `JsonRow` + stable callbacks; no state, no effects, no fetching. Memoized so scrolling never re-renders unchanged rows. |
| `LazyJsonViewer.stories.tsx` | Demo surface (small / wide-20k / deep / huge-string). |
| `rowModelStore.clienttest.ts` | Pins the store contract: laziness, expand/collapse counts, pagination + load-more, revision bumps, materialize. |

## Rules that keep it honest

- The `RowModel` is the only thing the renderer knows; it never sees bytes/tree.
- Cost is proportional to what is expanded/visible — never to total size. A row
  carries only a bounded preview; the full value is fetched on demand.
- Within one revision a visible row is immutable, so the store merges only
  missing indices and scroll re-fetches never churn stable row objects.
- Async responses are revision-stamped; a window resolved against a
  since-mutated model is dropped.
