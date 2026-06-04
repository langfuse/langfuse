# Virtualized Lists

Virtualized lists are render-boundary infrastructure. They should calculate
which item shells are visible and position those shells. They should not become
row controllers.

## Current Langfuse Surfaces

TanStack virtualized surfaces currently include:

- `web/src/components/trace/components/_shared/VirtualizedTree.tsx`
- `web/src/components/trace/components/_shared/VirtualizedList.tsx`
- `web/src/components/trace/components/_shared/JSONTableView/JSONTableView.tsx`
- `web/src/components/trace/components/TraceTimeline/index.tsx`
- `web/src/components/ui/AdvancedJsonViewer/VirtualizedMultiSectionViewer.tsx`
- `web/src/features/slack/components/ChannelSelector.tsx`

Review these with the same state-boundary rules before adding measurement,
row-local effects, or controller state.

## Smartness Trap

The broken shape is:

- virtualizer rerenders on scroll
- parent recreates callbacks, config, row wrappers, or data objects
- row components receive changed props even though the semantic row did not
  change
- row-local effects/load state reset or refire
- dynamic measurement observes DOM changed by an external mutator such as Google
  Translate
- measurement updates virtualizer state, which rerenders the same rows again

That is not a small memoization bug. It is leaked state ownership.

The fix is to make scroll and measurement state update the smallest possible
integration boundary. If scrolling changes a virtual item offset, unchanged row
content should not receive new semantic props, refire effects, or recreate
expensive derived data.

## Google Translate DOM Behavior

Google Translate mutates rendered DOM after React has committed it. It can wrap
text nodes, replace text, and change element dimensions outside React's data
flow. React and TanStack Virtual do not know whether the changed DOM represents
stable translated content or a transient mutation.

Do not opt product UI out of translation with `translate="no"` unless product
explicitly chooses that. Langfuse must work under browser translation.

## Measurement Rules

- Always put the correct `data-index` on the row element TanStack treats as the
  item.
- Do not combine live `measureElement` with externally mutated translated DOM
  in text-heavy rows.
- Prefer fixed estimates plus overscan for simple rows.
- For dynamic text-heavy rows, use controlled measurement:
  - `ResizeObserver` reads the row shell.
  - Debounce commits.
  - Do not commit while actively scrolling.
  - Round heights to avoid sub-pixel churn.
  - Call `virtualizer.resizeItem(index, height)`.
  - If a row alternates between two heights repeatedly, clamp to a minimum
    height that still allows later legitimate growth.

## Row Rules

- The virtualizer owns positioning only.
- Row load state lives outside the row instance if remounts are expected.
- Expensive row content should be a memoized view component.
- Row containers may subscribe to local store slices and queries.
- View components should receive stable props and perform no effects.
- Feature-scoped row containers belong under `src/features/*`; shared
  `src/components/*` row exports should be context-free.
- Scrolling may rerender the virtualizer. It should not rerender unchanged
  expensive row content.
- Do not use a global store to preserve row state across virtualization. Use a
  view-scoped store owned by the mounted list/page instance.

## Migration Steps

1. Add temporary logs to identify whether scroll causes remounts, prop changes,
   measurement loops, or query refetches.
2. Remove logs before shipping.
3. Move row-local state that must survive virtualization into a local store.
4. Stabilize callbacks and config objects passed to rows.
5. Replace live `measureElement` with fixed estimates or controlled measurement.
6. Move row data preparation into pure functions or feature-local containers.
7. Verify with browser translation enabled, horizontal resize, and small
   vertical scroll deltas.
