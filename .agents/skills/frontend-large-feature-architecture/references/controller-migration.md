# Controller Migration Guide

Use this when a frontend surface has grown into one component that owns data
fetching, route glue, filters, table/list state, selection, drawers, actions,
and expensive rendering.

The future target is not "everything in a store." The target is clear
ownership:

- the page/view owns lifecycle and creates feature-scoped dependencies
- server state remains in tRPC/React Query
- route state remains in router/filter hooks
- high-frequency local UI state lives in a per-mount feature store
- pure data preparation lives in named helper functions
- complex workflows live in `actions/*.ts` or store actions
- rendered components are mostly view-only

Most existing features are not there yet. Migrate in narrow slices and keep
behavior stable.

## Step-by-Step Path

1. **Map the controller.** List every state group, query, derived value, effect,
   callback, action, and expensive child render owned by the component.
2. **Instrument one symptom.** Pick a concrete interaction such as row
   selection, scroll, filter change, drawer open, or saved-view change. Measure
   what rerenders, remounts, refetches, or recalculates.
3. **Choose one state boundary.** Start with high-frequency local UI state that
   currently reruns unrelated logic. Do not migrate everything at once.
4. **Create a local store instance.** Use lazy `useState` in the page/view:

   ```ts
   const [store] = useState(() => createFeatureStore(initialState));
   ```

   Provide only this stable store instance through context.

5. **Move mutations into named actions.** Put state-changing logic in store
   actions or external action functions. Keep components responsible for user
   events, not workflows.
6. **Split containers from views.** Containers may subscribe to store slices,
   call hooks, or fetch data. Views should render props or tiny selected values.
7. **Move data preparation out of render.** Put expensive or complicated
   transformations in pure functions. Backend data should flow into compiled UI
   data, then into rendering.
8. **Bridge query state explicitly.** If local store decisions depend on React
   Query data, use a named feature hook or action to express that relationship.
9. **Isolate imperative integration.** Virtualizers, observers, keyboard
   listeners, third-party DOM mutation handling, and timers belong in narrow
   integration hooks.
10. **Update the feature README.** Record the current owner map, desired
    boundaries, known spread state, and next extraction target.
11. **Remove debug instrumentation.** Temporary logs are useful during
    migration, but should not survive the slice.
12. **Repeat.** Each slice should make one semantic interaction narrower and
    easier to reason about.

## What Good Looks Like

- A local state change wakes only components that selected that state.
- Page controllers no longer rebuild columns, filters, row wrappers, and action
  callbacks for unrelated row-level changes.
- Expensive rows/cells are view-only behind narrow containers.
- Effects are integration boundaries or one-time initialization, not ordinary
  data derivation.
- Complex workflows can be called without rendering the page.
- The feature README tells the next developer where state belongs.

## What To Avoid

- Replacing a giant component with a giant global store.
- Moving all state at once without measured acceptance criteria.
- Treating memoization as the architecture.
- Putting provider-coupled store hooks into shared `src/components/*` exports.
- Creating a feature folder structure without documenting ownership boundaries.
- Leaving a workflow inline in the page because the page had every dependency in
  scope.
