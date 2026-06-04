# Local Feature State

Large frontend features should not let one controller component own everything.
That shape guarantees broad rerenders: one checkbox or row-hover state change
reruns the component that also builds filters, columns, data wrappers, expensive
cells, actions, drawers, and routing glue.

This is not just inefficient. It is unstable. Broad rerenders recreate
identities, refire effects, reset row-local state, retrigger query containers,
and can feed virtualization or DOM-measurement loops. The goal is to make each
state change wake only the UI and actions that semantically depend on it.

## Default Pattern

1. Keep the page/view as the lifecycle owner.
2. Create one local vanilla Zustand store per mounted feature instance with a
   lazy `useState` initializer.
3. Provide only the stable store instance through context.
4. Keep server/query state in tRPC/React Query.
5. Keep URL state in the router/filter hooks.
6. Move state-changing logic into named store actions.
7. Split UI into small subscribers that select only the state they need.
8. Keep expensive cells/rows view-only behind narrow containers.
9. Put complex data preparation in pure functions before render.
10. Put complex user actions in external async functions or store actions.
11. Bridge local store state and React Query data explicitly in a feature hook
    when they need to influence each other.
12. Add or update the feature root `README.md` for large features so entry
    points, folder boundaries, state ownership, and relevant agent docs are
    discoverable before the next change.

## Feature README

Use `README.md` in the feature root, matching the existing
`web/src/features/*` convention. Keep it short. It should answer:

- What surface does this feature own?
- Which files are page/view lifecycle owners?
- Which subfolders contain shared components, surface-private components, pure
  helpers, stores, or integration hooks?
- Where does server state, route state, local feature state, and imperative DOM
  integration state belong?
- Which high-frequency interactions are performance or stability boundaries?
- Which agent docs or migration notes should be read before extending the
  feature?

Do not use the README as a changelog. If the feature has known architectural
debt, record only durable state-boundary facts and link to the relevant agent
reference note.

For a concrete owner-map template, read `feature-readmes.md`.

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
make a controller component smaller.

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

The component is responsible for hooks and lifecycle wiring:

- call tRPC/React Query hooks
- read route params
- create or access the local store
- get analytics capture functions
- pass the narrow dependencies to the action

The action owns the workflow:

- fetch/refetch data through callbacks it receives
- read state from a passed store if needed
- call pure data-preparation helpers
- perform browser side effects such as file downloads
- emit analytics through a passed capture function

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

For substantial data shaping, export a pure helper next to the action, e.g.
`buildFeatureExportData(...)`. That keeps the action testable without rendering
the page.

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

- A table/list controller owns selection, filters, columns, routing, peek state,
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
  controller render.
- Components subscribe to large objects when they only need a boolean.
- `useEffect` derives ordinary UI state from fetched data. Prepare data
  directly from query results instead.
- A component passes a long chain of feature context through props just so a
  button can perform an action.
- A page controller keeps a complex async workflow inline because all the hooks
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
