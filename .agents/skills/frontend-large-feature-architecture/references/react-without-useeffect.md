# React Without useEffect

UI is a pure function of state. Almost every `useEffect` that derives,
prepares, or syncs data should not exist. The codebase has hundreds of them
(over 350 `useEffect` call sites in `web/src` at the time of writing), and
agents reach for `useEffect` by default because their training data is full
of it. Do not.
This file is the golden example and the target shape. Treat every
data-derivation effect you touch as a migration candidate.

## Mental Model: State → Frame

Think of React as a game engine: the UI is a frame, rendered from state by a
pure function. An effect that writes state breaks that model mechanically:
React commits and paints a frame from incomplete state, the effect fires
after paint, and a second render repairs the frame. Between those frames the
user can act and async results can land, so the repair step races real input —
this is where "the effect reset my form" bugs come from. Concurrent rendering
(React 18+) makes the timing even less predictable, but the model was already
broken: two renders and a repair step where one pure render should be.

Keep render pure. Logic belongs where execution is synchronous and owned:
event handlers, named actions, or plain derived values.

## The #1 Anti-Pattern: Effects That Derive Or Prepare Data

Real case, `web/src/features/monitors/pages/EditMonitorPage.tsx`:

```tsx
const [liveName, setLiveName] = useState("");
useEffect(() => {
  setLiveName(data?.name ?? "");
}, [data?.name]);
```

An effect mirrors fetched data into local state. Now there are two sources of
truth, a timing window between them, and a race: if the user edits the name
before the query settles, the effect clobbers their input.

Two fixes, depending on what the value is:

- **Purely derived value** (never edited locally): compute it in render. No
  state, no effect: `const title = data?.name ?? ""`.
- **Loaded data seeding editable state** (this case): use the golden split
  below.

## The Golden Example: Split The Component, Gate Render On Load

Split into two components. The outer one is a data preparer + controller: it
fetches and renders a loading state while the query is pending — prefer a
skeleton that matches the final layout; a `<Spinner />` is the minimal
fallback. The inner one receives the loaded value as an `initialValue` prop
and seeds `useState(initialValue)` — the value is guaranteed present and
stable, and no effect can clobber it.

```tsx
// Outer: data preparer + controller. Do not render UI before its data is ready.
function EditMonitorPage() {
  const { data, isPending } = api.monitors.get.useQuery({ projectId, id });
  if (isPending) return <Spinner />;
  if (!data) return <ErrorPage title="Monitor not found" />;
  return <EditMonitorForm key={data.id} initialMonitor={data} />;
}

// Inner: mounts only once data exists. Seeds state exactly once.
function EditMonitorForm({ initialMonitor }: { initialMonitor: Monitor }) {
  const [liveName, setLiveName] = useState(initialMonitor.name);
  // ...
}
```

This kills the whole class of typing-before-load races: there is no moment
where the form exists without its data. The `key` remounts the inner component
when the entity identity changes, so the seed stays honest.

## Derive Client State From Server State

When client state refers to server data — a selected row, an active id, a
chosen option — store only the user's intent (the id) and derive the effective
value during render by merging it with the query data:

```tsx
const selectedId = useFeatureStore((s) => s.selectedId);
const selected = rows.find((r) => r.id === selectedId) ?? null;
```

Do not write an effect that validates or copies server data into the client
store on refetch. Deriving keeps one source of truth per fact — the store owns
intent, the query owns data — and the merge stays correct through loading,
refetch, and invalidation. Wrap the merge in `useMemo` only when it is
measurably expensive. (Pattern:
[Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state).)

## Forms

Only define a form where all initial values are already prepared. If data is
still loading, the form lives deeper in the tree: a `DataPreparerAndController`
fetches, shows a loading state, then passes `initialValues` and `onSubmit` to a
pure `FormComponent` that only renders fields and submits.

Real case, `web/src/features/playground/page/components/CreateOrEditLLMToolDialog.tsx`:
`useForm` is created at the top of the dialog with create-mode defaults, then a
"populate form when in edit mode" effect calls `form.reset(...)` once the
existing tool is available. The fix is structural, not a better effect: decide
the `defaultValues` (create vs. edit) before rendering the form component, and
render the form only when they are ready. The reset effect disappears.

## Big Actions Live Outside React

`queryClient` (React Query) and vanilla Zustand store instances are reachable
outside the component tree — nothing forces a workflow through a hook or an
effect. In the same dialog, `prettifyJson` and `handleDelete` are trapped
inside the component because they close over form state and mutation hooks.
Restructure so the dependencies live outside (the store, or a small passed-in
dependency object), and the action becomes a plain, testable function.

See `big-feature-rules.md` (Effects And Actions) and `local-feature-state.md`
(Independent Actions) for the action shape.

## When useEffect Is Legitimate

An effect is for reaching things that exist outside React's render: the DOM
and browser APIs. `document.addEventListener`/`removeEventListener`,
observers, imperative third-party APIs, Web Audio (which also requires a user
gesture). A healthy effect has: no dependencies (or minimal stable ones), one
concern, and a cleanup function.

## useCallback And useMemo Are Premature Optimization

`useCallback` is `useMemo` for a function. Do not memoize before a confirmed,
measured performance problem. Fix performance by splitting components and
correcting re-render boundaries — splitting is itself a form of memoization.
Needing memoization everywhere means the component re-renders too often, which
means a state boundary is wrong. Fix the boundary.

The exception is referential stability as a correctness requirement: when a
callback or object is a dependency of a legitimate integration effect or a
data-fetching hook, memoize it — or hoist it outside the component — so the
dependency does not change identity every render and loop the effect. That is
correctness, not optimization.

## Prefer UI Solutions Over Code Solutions

Many frontend problems have UI solutions, not code solutions. A loading state
plus gated rendering deletes more complexity than a clever behavior-preserving
refactor. Do not fear changing behavior to simplify: rendering a skeleton
where the page previously showed a half-ready form is an improvement, not a
regression. This is also why "write a characterization test, then refactor
preserving behavior" rarely fits large frontend refactors — the target
behavior is often the simpler one, not the current one.

## The Vision

Fetched data flows one way: query → prepared data → render, gated on
readiness. State is seeded from props, edited by handlers, and never mirrored
by effects. Actions are plain functions outside the tree. Effects that remain
are thin DOM/browser integrations with cleanup. Hundreds of cases do not yet
look like this — when you touch one, move it toward this shape rather than
extending the effect.
