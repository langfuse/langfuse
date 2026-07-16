---
name: frontend-large-feature-architecture
description: |
  Use when building, changing, or refactoring large Langfuse frontend features,
  virtualized lists, large tables, controller components, local feature state,
  Zustand stores, row selection, high-frequency UI state, or
  rendering-performance issues. Also read BEFORE writing any useEffect
  (especially one that syncs fetched data into state), wiring form
  initialValues/defaultValues from loaded data, or adding useCallback/useMemo.
---

# Frontend Large Feature Architecture

Use this skill when building, changing, or refactoring a large frontend
surface.

In this skill, "controller" means a component or hook that owns feature logic:
data fetching, view state, table/list state, effects, actions, and expensive
rendering. The problem is not the name; it is one place owning too many
changing responsibilities.

## Big Feature Rules

When a feature grows, split rendering from logic. Most components should be
view-only. Data preparation should be pure. Complex user actions should live in
external async functions or local-store actions. Effects are integration
boundaries, not the normal way to derive state.

For the full rules, read
[`references/big-feature-rules.md`](references/big-feature-rules.md).

## React Without useEffect

UI is a pure function of state. Do not use `useEffect` to derive, prepare, or
sync data:

- Derived values are computed in render (`const title = data?.name ?? ""`),
  never mirrored into state by an effect. Client state that refers to server
  data stores only the user's intent (an id) and derives the effective value
  by merging with query data in render.
- When loaded data seeds editable state, split the component: an outer
  data-preparer/controller fetches and renders a loading state (prefer a
  skeleton; `<Spinner />` as minimal fallback); the inner component receives
  the loaded value as an `initialValue` prop and seeds `useState(initialValue)`.
  Do not render UI before its data is ready.
- Define a form only where all initial values are already prepared; if data is
  still loading, the form lives deeper in the tree.
- Complex actions live outside React as plain functions using the store or
  query client — not inside components, not behind effects.
- `useCallback`/`useMemo` are premature optimization; fix re-render problems by
  splitting components, not memoizing.
- `useEffect` is legitimate only for DOM/browser API integration: no (or
  minimal) dependencies, one concern, and a cleanup function.

For the golden example and full reasoning, read
[`references/react-without-useeffect.md`](references/react-without-useeffect.md).

## Required Model

- The page/view owns lifecycle and creates feature-scoped dependencies.
- Server/query state stays in tRPC/React Query; route state stays in the
  router/filter hooks.
- High-frequency feature UI state belongs in a per-mount local vanilla Zustand
  store. Create it with lazy `useState`, not `useMemo`.
- Global stores are only for truly cross-feature, cross-route product state.
- React context may provide a stable store or action owner. Do not put
  frequently changing state directly in provider values.
- Rendered rows/cells/items should be view-only or narrow containers. Put
  effects, subscriptions, data loading, and workflows outside expensive views.
- Shared `src/components/*` exports should stay context-free or receive
  explicit props. Put view-scoped Zustand consumers in `src/features/*`.
- Large feature folders should have a concise `README.md` owner map.
- Migrate real features toward this model whenever you touch them: improve
  state boundaries, action workflows, data-preparation seams, and render
  boundaries. Hundreds of legacy cases remain — do not preserve a legacy shape
  just to keep a change small.

## Local Store Default

Prefer a local vanilla Zustand store for large or high-frequency feature state.
The store is created by the page/view and destroyed on unmount.

Use selectors that return primitives or stable references. If a component needs
multiple values, use shallow selector helpers or split subscriptions so one
changing field does not rerender unrelated UI.

Complex user workflows should live in `actions/*.ts` files or store actions.
The component wires hooks and passes dependencies; the action owns the workflow.

For a complete effect audit or component-splitting recipes, use
[`../refactor-react-effects/SKILL.md`](../refactor-react-effects/SKILL.md).

## When To Read References

- For the core big-feature rules and migration reality, read
  [`references/big-feature-rules.md`](references/big-feature-rules.md).
- For the React-without-useEffect model — derived values, gating render on
  loaded data, `initialValue` props, forms, actions outside React, and why not
  to memoize — read
  [`references/react-without-useeffect.md`](references/react-without-useeffect.md).
- For virtualized lists, translated DOM, row measurement, and scroll rerenders,
  read [`references/virtualized-lists.md`](references/virtualized-lists.md).
- For local feature stores and splitting large components, read
  [`references/local-feature-state.md`](references/local-feature-state.md).
- For feature `README.md` owner maps, read
  [`references/feature-readmes.md`](references/feature-readmes.md).
- For a step-by-step migration from a controller component to a managed feature
  pattern, read
  [`references/controller-migration.md`](references/controller-migration.md).
  This is the default reference for traces/observations tables, sessions,
  experiments, prompts, evals, datasets, and other controller-heavy surfaces.
