# Big Feature Rules

Use these rules when a feature keeps growing and the instinct is to add one
more state variable, prop, callback, or effect to the same component.

Here, "controller" means a component or hook that owns feature logic: state,
effects, data loading, subscriptions, actions, and derived data. Some
controller code is necessary. The failure mode is one controller owning too many
changing responsibilities and waking too much UI.

## Ownership Baseline

- The page/view owns lifecycle and creates feature-scoped dependencies.
- Server/query state stays in tRPC/React Query.
- Route state stays in router/filter hooks.
- High-frequency local UI state belongs in a per-mount feature store.
- Global stores are only for product state shared across routes or features.
- Pure data preparation turns fetched data into UI data before rendering.
- Complex workflows live in `actions/*.ts` or store actions.
- Effects are integration boundaries, not ordinary state derivation.
- Expensive rows/cells/items should be view-only behind narrow containers.

## Hard Rules

1. Growth usually means React rendering and feature logic need to be separated.
   A bigger component is not an architecture.
2. Most components should be view-only. They render what they are given, or
   they read a small selected value from a context-available feature store.
3. Complicated data preparation belongs in separate pure functions. Backend
   data should flow one way: fetched data -> compiled UI data -> render.
4. User actions that trigger complex logic should live outside render
   components as named async functions or store actions. If the action needs a
   lot of context, pass the feature store instance and let the action read what
   it needs.
5. A feature with both local store state and React Query data needs an explicit
   bridge in a custom hook or named action.
6. Prefer view-scoped local feature stores over global stores for page-instance
   state. Filters, selected rows, expanded rows, lazy load state, drawers, and
   local actions usually belong to one mounted page instance.
7. Create local store instances with a lazy `useState` initializer, not
   `useMemo`. The store is a per-mount instance, not a render-time derived
   value.
8. Effects should not be normal state mutators. Before adding an effect, try
   pure data preparation, a store action, or an explicit event handler.
9. Do not copy existing large Langfuse feature components as examples. Treat
   them as legacy unless they follow this skill.
10. Follow the golden example in `react-without-useeffect.md`: gate render on
    loaded data, seed state from `initialValue` props, and derive values in
    render instead of syncing them with effects. When a change improves a
    feature boundary, update the feature README or migration note with what
    changed and the next slice.

## Migration Reality

Most large frontend features are not yet in the ideal shape. Traces,
observations, experiments, prompts, evals, datasets, and session views all have
controller-heavy surfaces, and there are hundreds of cases still to fix —
including hundreds of `useEffect` calls that derive or sync state. Do not copy
an existing large component just because it works today; treat it as a
migration candidate. Do not scale ambition down either: broad, coherent
improvements are welcome as long as each changed boundary is deliberate.

The golden example — gate render on loaded data, seed state from props, keep
actions outside React — is in `react-without-useeffect.md`. For the
step-by-step controller path, read `controller-migration.md`.

## Effects And Actions

Effects are for named external-system integrations: subscriptions, observers,
browser event listeners, timers, and imperative third-party APIs, plus their
cleanup. Keep them in containers or feature hooks, not view
components. If an effect writes state repeatedly, make the store action
idempotent.

Complex actions should be callable without rendering a component. Put workflows
in `actions/*.ts` or named store actions. Components wire hooks and pass
dependencies; actions own the workflow.

```ts
await applyBulkAction({
  store,
  queryClient,
  projectId,
});
```

Actions must not call React hooks. Pass hook results, query helpers, the local
store instance, or narrow callback dependencies into the action. If an action
needs substantial data preparation, export a pure helper next to it so the
transformation can be tested independently.

Do not pass twenty props through the tree so a button can do feature-level work,
and do not leave complex workflows inline in a page controller because that
controller happened to have all dependencies in scope.
