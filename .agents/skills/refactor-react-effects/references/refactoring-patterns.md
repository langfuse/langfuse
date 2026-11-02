# React Effect Refactoring Patterns

Use the smallest pattern that makes ownership and lifecycle explicit.

## Gate Required Data, Then Initialize the Child

Do not mount a stateful form with missing defaults and repair it after paint.
Let the query-owning parent render the loading/error state. Mount the form only
with complete initial values.

```tsx
function UserFormContainer({ userId }: { userId: string }) {
  const userQuery = api.users.byId.useQuery({ userId });

  if (userQuery.isPending) return <Spinner />;
  if (userQuery.isError) return <ErrorPage />;

  const initialValues = toUserFormValues(userQuery.data);

  return <UserForm key={userQuery.data.id} initialValues={initialValues} />;
}

function UserForm({ initialValues }: { initialValues: UserFormValues }) {
  const [values, setValues] = useState(() => initialValues);

  return <UserFields values={values} onChange={setValues} />;
}
```

The `key` expresses that changing to another user discards the previous draft.
Do not include a query update timestamp or version in the key unless every
refetch should intentionally discard edits. If users must choose when to adopt
fresh server values, expose a reset/refresh action instead.

## Derive Valid Client State from Server State

Keep the user's stored intent and derive whether it is currently valid. Do not
overwrite a selection store every time query data changes.

```tsx
const selectedUserId = useUserStore((state) => state.selectedUserId);
const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
```

This avoids a synchronization effect and preserves enough information to show
an invalid selection or restore it if the server value reappears. Expose the
derived value through one selector or custom hook so callers do not bypass the
validation rule accidentally.

## Compute Redundant Values During Render

```tsx
// Avoid: useEffect(() => setFullName(`${first} ${last}`), [first, last]);
const fullName = `${first} ${last}`;
```

Extract an expensive or complicated transformation into a pure function and
test it directly. Add memoization only when measurement shows that the pure
calculation is expensive or referential stability is required by a consumer.

## Put User-Triggered Work in an Action

Do not encode “when this flag becomes true, submit” as state plus an effect.
Call the workflow from the event that caused it.

```ts
type SaveWidgetDependencies = {
  store: WidgetStore;
  queryClient: QueryClient;
  mutateAsync: (input: SaveWidgetInput) => Promise<Widget>;
};

export async function saveWidget({
  store,
  queryClient,
  mutateAsync,
}: SaveWidgetDependencies) {
  const input = selectWidgetInput(store.getState());
  const widget = await mutateAsync(input);

  store.getState().markSaved(widget.id);
  await queryClient.invalidateQueries({ queryKey: ["widgets"] });
}
```

The component may use hooks to obtain `mutateAsync` or the query client, then
pass those dependencies to the action from `onClick` or `onSubmit`. A vanilla
Zustand store can be read directly by the action. The action itself must not
call hooks.

## Use Query APIs for Server Data

Do not fetch server data in an effect and mirror `loading`, `error`, and `data`
into local state when tRPC/React Query can own that lifecycle. Keep query data
as server state and derive render values from it.

For imperative work that must happen after a mutation, keep the sequence in the
mutation callback or the named action invoked by the event. Do not introduce a
“mutation completed” flag that another effect watches.

## Reset State Through Identity or an Explicit Event

When local state belongs to a particular entity, choose one behavior:

- preserve the draft while background data refetches;
- remount a keyed child when entity identity changes;
- reset from a deliberate cancel/reset/reload event;
- eliminate local state and make the server/query value the source of truth.

Do not let an effect choose implicitly, because it will often overwrite user
input on background refetch.

## Retain Only External-System Synchronization

An effect is appropriate when the component must connect to something React
does not control:

```tsx
useEffect(() => {
  const unsubscribe = externalStore.subscribe(handleChange);
  return unsubscribe;
}, [externalStore, handleChange]);
```

Other legitimate examples include `ResizeObserver`, browser event listeners,
timers, and imperative third-party widgets. Prefer existing subscription hooks
such as `useSyncExternalStore` when they model the integration more directly.
Keep setup and cleanup symmetrical, and do not mix ordinary data derivation
into the integration effect.

## Prefer Conditional Mounting for External Integrations

If an external integration should exist only after a precondition is met, make
that precondition a component boundary instead of a guard inside an effect.

```tsx
function PlayerArea({ ready }: { ready: boolean }) {
  return (
    <>
      <PlayerShell ready={ready} />
      {ready ? <PlayerInstance /> : null}
    </>
  );
}
```

The integration component now has one lifecycle: mount means connect; unmount
means disconnect. A `key` can provide a fresh lifecycle when an entity ID
changes.

## Stable References

- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [TkDodo: Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state)
- [Alvin Sng: Why we banned React's useEffect](https://x.com/alvinsng/article/2033969062834045089)
