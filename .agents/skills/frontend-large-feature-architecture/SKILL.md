---
name: frontend-large-feature-architecture
description: |
  Use when refactoring large Langfuse frontend features, virtualized lists,
  large tables, controller components, local feature state, Zustand stores,
  row selection, high-frequency UI state, or rendering-performance issues.
---

# Frontend Large Feature Architecture

Use this skill when a frontend surface has become a controller component: data
fetching, view state, table/list state, actions, and expensive rendering all
owned by one React component.

## Big Feature Rules

When a feature grows, split rendering from logic. Most components should be
view-only. Data preparation should be pure. Complex user actions should live in
external async functions or local-store actions. Effects are integration
boundaries, not the normal way to derive state.

For the full rules, read
[`references/big-feature-rules.md`](references/big-feature-rules.md).

## Required Model

- The page/view owns lifecycle and creates feature-scoped dependencies.
- Server/query state stays in tRPC/React Query.
- Route state stays in the router.
- High-frequency feature UI state belongs in a view-scoped store created per
  mounted feature instance.
- Create local store instances with a lazy `useState` initializer by default,
  e.g. `const [store] = useState(() => createFeatureStore(...))`. Do not use
  `useMemo` for store instance lifetime.
- Do not turn local-state-heavy pages into global-store features. Use local
  stores by default; global state is only for truly cross-feature, cross-route
  product state.
- React context may provide a stable store/controller instance. Do not put
  frequently changing state directly in context provider values.
- Rendered rows/cells/items should be view-only. Put effects, subscriptions,
  and data loading in narrow containers around them.
- Shared `src/components/*` exports should stay context-free or receive explicit
  props. Put view-scoped Zustand consumers in `src/features/*` containers.
- Large feature folders should have a concise `README.md` owner map that lists
  entry points, subfolders, external consumers, state boundaries, performance
  boundaries, and relevant agent docs.

## Local Store Default

Prefer a local vanilla Zustand store for large or high-frequency feature state.
The store must be created by the page/view and destroyed on unmount. Do not
create global stores for feature instance state.

Use selectors that return primitives or stable references. If a component needs
multiple values, use shallow selector helpers or split subscriptions so one
changing field does not rerender unrelated UI.

This is a performance and stability pattern: narrow subscriptions prevent one
state change from rerunning controllers, recreating props/config, refiring
effects, resetting virtualized row state, or retriggering measurement loops.

Complex user workflows should live in `actions/*.ts` files or store actions.
The component wires hooks and passes dependencies; the action owns the workflow.

## When To Read References

- For the core big-feature rules and migration reality, read
  [`references/big-feature-rules.md`](references/big-feature-rules.md).
- For virtualized lists, translated DOM, row measurement, and scroll rerenders,
  read [`references/virtualized-lists.md`](references/virtualized-lists.md).
- For local feature stores and controller breakup, read
  [`references/local-feature-state.md`](references/local-feature-state.md).
- For feature `README.md` owner maps, read
  [`references/feature-readmes.md`](references/feature-readmes.md).
- For a step-by-step migration from a controller component to a managed feature
  pattern, read
  [`references/controller-migration.md`](references/controller-migration.md).
