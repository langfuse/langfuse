# Controller Migration Guide

Use this when a frontend surface has grown into one component or hook that owns
data fetching, route glue, filters, table/list state, selection, drawers,
actions, and expensive rendering.

The target is clear ownership, not "everything in a store." Start from the
ownership baseline in `big-feature-rules.md`.

Most existing features are not there yet. Migrate in narrow slices and keep
behavior stable.

## Realistic Migration Strategy

Do not start by designing the perfect final feature. Start by making the next
change safer than the previous one.

For each migration PR, write down:

- the current controller problem being targeted
- the single state/action/data-preparation/render boundary being improved
- what behavior must remain unchanged
- what instrumentation or tests prove the slice worked
- what still remains spread across the feature
- the next recommended atomic slice

This is how large features become managed features without review-hostile
rewrites. The feature README is the living owner map; update it in place as the
feature moves forward.

## Step-by-Step Path

1. **Map the controller.** List every state group, query, derived value, effect,
   callback, action, and expensive child render owned by the component.
2. **Classify state.** Separate server/query, route, persisted browser,
   high-frequency local UI, derived view data, imperative integration, and
   one-off modal/form state.
3. **Instrument one symptom.** Pick a concrete interaction such as row
   selection, scroll, filter change, drawer open, form step change, or
   saved-view change. Measure what rerenders, remounts, refetches, or
   recalculates.
4. **Choose one boundary.** Start with the smallest high-value boundary:
   selection, lazy-row state, batch action workflow, filter-target mapping,
   column/view state, wizard step state, or pure data preparation. Do not
   migrate everything at once.
5. **Choose the lightest tool.** A pure helper or action extraction may be the
   right first PR. Add a local store only when selective subscriptions or
   per-mount persistence are needed.
6. **Create a local store instance when needed.** Use lazy `useState` in the
   page/view:

   ```ts
   const [store] = useState(() => createFeatureStore(initialState));
   ```

   Provide only this stable store instance through context.

7. **Move mutations into named actions.** Put state-changing logic in store
   actions or external action functions. Keep components responsible for user
   events, not workflows.
8. **Split containers from views.** Containers may subscribe, call hooks, or
   fetch data. Views should render props or tiny selected values.
9. **Move data preparation out of render.** Put expensive or complicated
   transformations in pure functions. Backend data should flow into compiled UI
   data, then into rendering.
10. **Bridge query state explicitly.** If local store decisions depend on React
    Query data, use a named feature hook or action to express that relationship.
11. **Isolate imperative integration.** Virtualizers, observers, keyboard
    listeners, third-party DOM mutation handling, and timers belong in narrow
    integration hooks.
12. **Update the feature README.** Record what this PR improved, desired
    boundaries, known spread state, and the next extraction target.
13. **Remove debug instrumentation.** Temporary logs are useful during
    migration, but should not survive the slice.
14. **Repeat.** Each slice should make one semantic interaction narrower and
    easier to reason about.

## Feature-Specific First Slices

Use the feature's current shape to pick the first slice:

- **Traces and observations tables**: start with row selection, select-all,
  batch actions, or expensive cell wrappers.
- **Session detail and session events**: isolate virtualization, lazy-row load
  state, and dynamic measurement from rendered row content.
- **Experiment result tables**: start with selected-row state, filter-target
  mapping, run/evaluation batch actions, or pure helpers for comparison column
  construction.
- **Experiment creation wizards**: separate submitted form data from display
  state such as active step, selected prompt labels, schema display names, and
  evaluator selection.
- **Prompt management**: split prompt detail route/query state, label/version
  selection, prompt history data preparation, and mutation workflows.
- **Eval template and evaluator forms**: extract form defaults, model/provider
  preparation, validation helpers, and submit workflows before adding a store.
- **Datasets and dataset runs**: isolate active-cell/compare-field state,
  table selection, run comparison preparation, and upload/import workflows.

If a feature already has hooks for part of this work, treat them as partial
migration, not proof that the whole surface is healthy.

## Acceptance Criteria

- A local state change wakes only components that selected that state.
- Page components no longer rebuild columns, filters, row wrappers, and action
  callbacks for unrelated row-level changes.
- Expensive rows/cells are view-only behind narrow containers.
- Effects are integration boundaries or one-time initialization, not ordinary
  data derivation.
- Complex workflows can be called without rendering the page.
- The feature README tells the next developer what has improved, what remains
  spread, and what the next small PR should target.

Avoid:

- Replacing a giant component with a giant global store.
- Moving all state at once without measured acceptance criteria.
- Treating memoization as the architecture.
- Putting provider-coupled store hooks into shared `src/components/*` exports.
- Leaving a workflow inline in the page because the page had every dependency in
  scope.
- Using the README as a victory statement while hiding remaining controller
  state. Be explicit about remaining debt.
