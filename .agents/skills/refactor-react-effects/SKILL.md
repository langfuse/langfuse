---
name: refactor-react-effects
description: |
  Refactor avoidable React useEffect usage in Langfuse frontend code. Use when
  adding, reviewing, or removing effects; initializing forms or local UI state
  from query data; synchronizing client and server state; moving mutations or
  async workflows out of components; cleaning every effect from a frontend
  submodule; or reviewing whether an effect has a valid external-system owner.
---

# Refactor React Effects

Do not add `useEffect` by default. Use it only to synchronize a component with
a concrete system outside React. If there is no external system, remove the
effect.

Before adding or retaining an effect, answer all of these questions:

1. Which external system is being synchronized?
2. What starts or updates the synchronization?
3. What cleanup, if any, prevents leaks or duplicate subscriptions?
4. Why can an event handler, query API, render derivation, conditional mount,
   or existing integration hook not own the behavior?

If the first question has no concrete answer, do not use an effect.

## Required Context

- Read `web/AGENTS.md` and the nearest package guidance before changing web
  code.
- For large features, local Zustand stores, tables, or controller components,
  also read
  [`../frontend-large-feature-architecture/SKILL.md`](../frontend-large-feature-architecture/SKILL.md).
- Read
  [`references/refactoring-patterns.md`](references/refactoring-patterns.md)
  before implementing a refactor.

## Decision Rules

Apply these rules in order:

1. **Derive during render.** Compute values from current props, query data, and
   client state instead of storing a synchronized copy.
2. **Gate on required data.** If a form or UI cannot initialize correctly
   without query data, let a parent own loading/error handling. Mount a child
   only after the data exists and pass guaranteed initial values to its lazy
   `useState` initializer.
3. **Make reset semantics explicit.** Use a `key` to remount for a new entity
   only when discarding the old local draft is intended. Use an explicit user
   action for refresh/reset when drafts must not be overwritten silently.
4. **Run actions from events.** Put submit, mutation, navigation, notification,
   and multi-step async workflows in event handlers, `actions/*.ts`, or store
   actions. Pass a React Query client, mutation callback, or vanilla Zustand
   store as a dependency; never call React hooks from those actions.
5. **Keep real integration effects.** Subscriptions, observers, browser event
   listeners, timers, and imperative third-party APIs may need an effect. Make
   setup and cleanup symmetrical and keep the effect in a narrow integration
   hook or container. In a direct-effect-free module, use a pre-existing,
   centrally owned integration hook. Do not create a feature-local wrapper just
   to hide `useEffect`.

Presume that an effect which writes React or Zustand state from props or query
data is removable. Do not evade the design problem by switching to
`useLayoutEffect`, suppressing dependency lint, hiding the same synchronization
in a custom hook, or adding an ESLint disable.

## Fast Smell Test

Refactor when any of these shapes appear:

- `useEffect(() => setX(deriveFromY(y)), [y])`;
- fetch data, then mirror it with `setState`;
- set a flag, let an effect perform the action, then clear the flag;
- chain effects where one state write triggers the next effect;
- reset local state because an ID or prop changed;
- guard an integration inside an effect when the component could mount only
  after the precondition is true.

## Workflow

### 1. Establish the Behavior Boundary

Identify the state owner, query owner, user events, external systems, and
loading/error states. For a bug fix, add the failing test first and confirm it
fails. For a behavior-preserving migration, reuse existing coverage where it
protects the relevant behavior; add focused coverage only for a meaningful
behavior risk such as draft preservation, entity changes, refetches, submits,
or cleanup. Do not add tests that inspect source code or merely assert that a
hook is absent. Use behavior tests and the effect inventory instead.

### 2. Inventory Every Effect

Search the full target module, including tests and stories:

```bash
rg -n '\b(use(?:Layout)?Effect|React\.use(?:Layout)?Effect)\b' 'web/src/features/<feature>'
```

Classify every result as:

- render derivation;
- query-to-local-state initialization;
- client/server state synchronization;
- user-event or async workflow;
- external-system integration;
- test-only harness behavior.

Do not refactor from a raw count alone. Record what triggers each effect, what
it writes or controls, and the replacement pattern.

### 3. Refactor One Semantic Seam at a Time

Prefer this order:

1. replace redundant state with pure derivation;
2. split data-owning parents from stateful children;
3. move event-driven work to handlers or external actions;
4. isolate unavoidable integrations in narrow hooks;
5. remove dead state, guards, dependencies, and imports.

Keep user-visible behavior stable. Avoid bundling unrelated file moves, visual
changes, and state architecture changes into the same slice.

### 4. Complete a Submodule Migration

Repeat the inventory after each slice. Before declaring a submodule clean:

- account for every original effect;
- confirm no effect merely moved behind a wrapper hook;
- confirm refetches do not overwrite local edits;
- confirm entity changes have deliberate preserve/reset semantics;
- confirm complex actions are callable without rendering the feature;
- document any real external integration effect that remains outside the
  refactoring target.

Do not add or modify effect-specific ESLint rules or pre-commit checks as part
of this workflow. Treat enforcement policy as separate, explicitly requested
work.

### 5. Verify

Run, at minimum:

- focused client tests for the changed behavior;
- ESLint on the migrated path, then `pnpm --filter web run lint`;
- type checking when state or action interfaces changed;
- a real-browser review for user-visible flows, using seeded data where
  applicable;
- the effect inventory again to prove the intended scope is clean.

Report the exact command summary lines and any retained effects with their
external-system rationale.

## Output Format

Return valid Markdown. For module audits, include a compact table with the
effect location, classification, replacement, and status. Check headings,
lists, links, tables, backticks, and code fences for valid Markdown syntax
before returning the report.
