# Feature READMEs

Large frontend feature folders should have a short `README.md` that acts as an
owner map for humans and agents. Prefer `README.md` over `FEATURE.md` to match
the existing `web/src/features/*` convention. Use `FEATURE.md` only if a folder
already has a user-facing or generated README.

The README is not a changelog. It should describe durable boundaries: entry
points, subfolders, state ownership, performance-sensitive interactions, and
where to find deeper migration notes.

## Required Sections

- **Surface**: what product surface the folder owns.
- **Entry Points**: route files or parent components that mount the feature,
  and the page/view lifecycle owner files they call.
- **Structure**: what each subfolder owns. Use root `components/` only for
  components reused across surfaces inside the feature. Use surface folders such
  as `detail/` for page controllers, local stores, `actions/`, integration
  hooks, and surface-private containers.
- **External Consumers**: other features that import these components. This
  keeps shared exports context-free and prevents accidental provider coupling.
- **State Ownership**: where server/query state, route state, local feature
  state, global product state, DOM integration state, and view-only props live.
- **Performance And Stability Boundaries**: which interactions are
  high-frequency or externally unstable, and which components are allowed to
  rerender or measure because of them.
- **Development Context**: agent skills, migration notes, or issue docs to read
  before extending the feature.

## State Ownership Rules

- Server data remains in tRPC/React Query unless a pure prepared view model is
  needed for rendering.
- URL state remains in router/filter hooks, but feature-specific interpretation
  belongs in a controller hook, pure helper, or local store action.
- Local feature stores are created by the mounted page/view and destroyed on
  unmount. This is the default for Langfuse pages because they are often
  local-state heavy.
- Global stores are only for product state shared across routes or features.
  Do not globalize state to hide prop drilling or controller complexity.
- DOM integration state, such as virtualizer measurement, observers, and
  third-party mutation handling, belongs in narrow integration hooks.
- View components should render props or subscribe to a small store slice. They
  should not derive controller state or own feature workflows.
- Complex feature workflows should live in `actions/*.ts` or store actions, not
  inline in page controllers or view components.

## Performance And Stability Map

Every large feature README should name the high-frequency interactions that
must stay narrow. Typical examples:

- scroll and virtualization updates
- row selection, hover, expansion, and lazy-loading
- filter, saved-view, and column-state changes
- drawers, peek navigation, and keyboard navigation
- browser translation or other third-party DOM mutation
- resize and dynamic row measurement

For each interaction, state which boundary should update. The page controller
should not rerun expensive data preparation, recreate column/config objects, or
rerender unchanged expensive cells for unrelated state changes.

## Current-State Honesty

If a feature is mid-migration, say so. The README should make the desired
boundaries clear while naming known spread state as debt. Do not present a
partially migrated feature as the final pattern.
