# Local Feature State

Large frontend features should not let one component or hook own everything.
That shape makes one checkbox, hover, or row-selection change rerun the code
that also builds filters, columns, data wrappers, expensive cells, drawers,
actions, and routing glue.

The goal is to make each state change wake only the UI and actions that
semantically depend on it.

## Default Pattern

Start from the ownership baseline in `big-feature-rules.md`, then add a local
vanilla Zustand store only when state is high-frequency, shared across multiple
subtrees in the mounted feature, or must survive row/item remounts.

Use this shape:

1. The page/view creates one store instance with lazy `useState`.
2. Context provides only the stable store instance.
3. Components subscribe to the smallest useful slice.
4. Mutations live in named store actions.
5. Complex user workflows live in `actions/*.ts` or store actions.
6. Expensive cells/rows stay view-only behind narrow containers.
7. Large feature roots have a short `README.md` owner map.

## Feature README

For a concrete owner-map template, read `feature-readmes.md`. Do not use the
README as a changelog; record durable ownership facts and the next migration
slice.

## Why Local, Not Global

Langfuse pages are often local-state heavy: filters, saved views, selected rows,
expanded rows, drawers, peek navigation, lazy row load state, and view-local
actions. Those states usually belong to one mounted page instance, not the whole
application.

Use local feature stores for this state. Create the store in the page/view and
destroy it on unmount. This keeps multiple mounted instances independent, avoids
cross-route state leaks, and makes ownership visible.

Global state is reserved for product state that is genuinely shared across
features or routes. Do not promote state globally to avoid prop drilling or to
make a large component smaller.

Do not add a store just to make a PR look architectural. If the immediate
problem is an inline export workflow, duplicated filter option shaping, or a
large column builder, first extract an action or pure helper. Use the store when
state needs selective subscriptions or must survive row remounts within one
mounted feature instance.

## Creating The Store

Prefer lazy `useState` for local store instances:

```ts
const [store] = useState(() =>
  createFeatureStore({
    initialProjectId: projectId,
  }),
);
```

This expresses the real lifecycle: one store instance for the committed mounted
view. The unused setter is acceptable. `useMemo` is the wrong default because it
is a render-time cache for derived values, not an ownership boundary for an
external store instance. A local store is stateful infrastructure, so treat its
identity as state.

`useRef` can also hold a stable instance, but prefer `useState` unless a ref is
needed for imperative setup. Keep store creation pure; sync changing route/query
inputs into named store actions such as `resetForFeature(...)` or `init(...)`.

## Independent Actions

Complex workflows should be independent functions. Put surface-specific actions
in `actions/*.ts`, or make them named store actions when they are tightly coupled
to local feature state.

The component wires hooks, route params, stores, analytics, and query helpers.
The action owns the workflow: refetching through callbacks, reading the passed
store if needed, calling pure helpers, performing browser side effects, and
emitting analytics.

Actions must not call React hooks. If a workflow needs a lot of context, pass
the local store instance or a small dependency object rather than threading long
prop chains through view components.

Example:

```ts
await exportFeatureData({
  capture,
  fetchDetails,
  projectId,
  refetchSummary,
  selectedIds,
});
```

For substantial data shaping, export a pure helper next to the action so the
transformation can be tested without rendering the page.

## Store Shape

Use immutable plain objects for keyed state that must be selector-friendly:

```ts
type FeatureStoreState = {
  selectedIds: Record<string, true>;
  activeId: string | null;
  actions: {
    toggleSelected: (id: string, selected: boolean) => void;
    setActiveId: (id: string | null) => void;
  };
};
```

Avoid mutating `Set` or `Map` in place. If you use them, replace the whole
instance when updating.

## Anti-Patterns

- A table/list component owns selection, filters, columns, routing, peek state,
  batch actions, local dialogs, and expensive rendered cells.
- Context provider `value` changes on row selection, hover, scroll, active row,
  expanded row, or other high-frequency state.
- Local feature state is promoted to a global store even though it only belongs
  to one mounted page instance.
- `useMemo` is used to own a local external store instance.
- A shared `src/components/*` component calls a feature-scoped store hook. That
  silently breaks other callers that do not mount the feature provider.
- Memoization is the only fix. `memo` helps, but it does not fix a bad state
  boundary.
- A callback depends on an inline config object and changes identity on every
  render.
- Components subscribe to large objects when they only need a boolean.
- `useEffect` derives ordinary UI state from fetched data.
- A component passes a long chain of feature context through props just so a
  button can perform an action.
- A page component keeps a complex async workflow inline because all the hooks
  happen to be in scope there.

## Migration Steps

1. Instrument first: identify which semantic state change causes broad renders.
2. Choose the smallest useful boundary: store state, action workflow, pure data
   preparation, or imperative integration hook.
3. Extract that one state group into a local store only when selective
   subscriptions are needed.
4. Replace broad props with selector subscriptions at the smallest UI boundary.
5. Move related mutations into named actions.
6. Stabilize callbacks and data wrappers.
7. Move expensive data preparation into pure functions.
8. Move complex user actions into store actions or external functions under
   `actions/*.ts`.
9. Update the feature README with what improved, what remains spread, and the
   next atomic slice.
10. Remove debug instrumentation.
11. Repeat for the next state group.
