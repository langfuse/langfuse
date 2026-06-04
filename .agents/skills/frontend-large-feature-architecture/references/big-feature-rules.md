# Big Feature Rules

Use these rules when a feature keeps growing and the instinct is to add another
state variable, prop, callback, or effect to the same controller component.

## Hard Rules

1. Growth usually means React rendering and feature logic need to be separated.
   A bigger component is not an architecture.
2. Most components should be stupid. They render what they are given, or they
   read a small selected value from a context-available feature store.
3. Complicated data preparation belongs in separate pure functions. Backend
   data should flow one way: fetched data -> compiled UI data -> render.
4. User actions that trigger complex logic should live outside render
   components as named async functions or store actions. If the action needs a
   lot of context, pass the feature store instance and let the action read what
   it needs.
5. A feature with both local store state and React Query data needs an explicit
   bridge. The store can trigger refetching. If store decisions depend on query
   data, put the interaction in a custom hook or store/controller action so the
   relationship is visible.
6. Prefer view-scoped local feature stores over global stores for page-instance
   state. Filters, selected rows, expanded rows, lazy load state, drawers, and
   local actions usually belong to one mounted page instance.
7. Create local store instances with a lazy `useState` initializer, not
   `useMemo`. The store is a per-mount instance, not a render-time derived
   value.
8. If effects are unavoidable, consolidate them into one initialization effect
   that calls `store.init(...)`. Prefer no dependencies. The store should own
   the initialization state machine.
9. The local feature store should be a simple, navigable state machine. It
   should expose state, derived facts, and actions with names that explain the
   feature workflow.
10. Effects should not be normal state mutators. If an effect changes state on
    every render or data change, the feature is not preparing data correctly.
11. Every time you want to add `useEffect` or `useLayoutEffect`, stop and try to
    replace it with pure data preparation, a store action, or an explicit event
    handler.
12. Do not copy existing large Langfuse feature components as examples. Treat
    them as legacy unless they follow this skill.

## Migration Reality

Most large frontend features are not yet in the ideal shape. Do not copy an
existing large component just because it works today. Treat controller-heavy
surfaces as migration candidates and move them one state boundary at a time.

For the step-by-step path, read `references/controller-migration.md`.

## Effect Policy

Effects are allowed for integration boundaries: subscriptions, observers,
imperative third-party APIs, one-time initialization, and cleanup. They are not
the default place to derive UI state.

When an effect is necessary:

- Keep it in a container or feature hook, not a view component.
- Prefer one init effect that calls a named store action.
- Keep the effect body tiny.
- Make repeated state writes idempotent inside the store.
- Document why render-time data preparation is insufficient.

## Action Policy

Complex actions should be callable without rendering a component. Put
surface-specific workflows in `actions/*.ts` or in named store actions. The
component should wire hooks and pass dependencies; the action should own the
workflow.

Prefer:

```ts
await applyBulkAction({
  store,
  queryClient,
  projectId,
});
```

or:

```ts
await exportFeatureData({
  capture,
  fetchDetails,
  projectId,
  refetchSummary,
  selectedIds,
});
```

or:

```ts
await store.getState().actions.applyBulkAction({ queryClient });
```

Actions must not call React hooks. Pass hook results, query helpers, the local
store instance, or narrow callback dependencies into the action. If an action
needs substantial data preparation, export a pure helper next to it so the
transformation can be tested independently.

Do not pass twenty props through the tree so a button can do feature-level work,
and do not leave complex workflows inline in a page controller because that
controller happened to have all dependencies in scope.
