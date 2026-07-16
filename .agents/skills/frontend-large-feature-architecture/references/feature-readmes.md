# Feature READMEs

Large frontend feature folders should have a short `README.md` that acts as an
owner map for humans and agents. Prefer `README.md` over `FEATURE.md` to match
the existing `web/src/features/*` convention. Use `FEATURE.md` only if a folder
already has a user-facing or generated README.

The README is not a changelog. It should describe durable boundaries and point
to deeper migration notes.

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
- **Migration State**: what has already been improved, what state/actions are
  still spread, and the next one or two atomic slices.
- **Development Context**: agent skills, migration notes, or issue docs to read
  before extending the feature.

## State Ownership Rules

Use the ownership baseline in `big-feature-rules.md`. The README only needs to
name where each state category lives in this feature and where known spread
state remains.

## Performance And Stability Map

Every large feature README should name the high-frequency interactions that
must stay narrow. Typical examples:

- scroll and virtualization updates
- row selection, hover, expansion, and lazy-loading
- filter, saved-view, and column-state changes
- drawers, peek navigation, and keyboard navigation
- browser translation or other third-party DOM mutation
- resize and dynamic row measurement

For each interaction, state which boundary should update. The page component
should not rerun expensive data preparation, recreate column/config objects, or
rerender unchanged expensive cells for unrelated state changes.

## Current-State Honesty

If a feature is mid-migration, say so. The README should make the desired
boundaries clear while naming known spread state as debt. Do not present a
partially migrated feature as the final pattern.

Use an update-in-place style rather than a changelog. For example:

- **Improved in current shape**: local store owns row selection; export action
  moved to `actions/exportFeatureData.ts`; row view no longer subscribes to
  filter state.
- **Still spread**: saved-view state remains in the page controller; filter
  option preparation is still inline; mutation workflows still close over page
  hooks.
- **Next slice**: extract filter-option preparation into pure helpers; move
  batch action workflow into an action file; split route/query glue from view
  components.

This keeps each improvement reviewable while keeping the feature migration
plan visible. Do not wait for a perfect reorganization before documenting the
current state.

## Matching Updates To The Change

Feature README updates should match what actually changed:

- For a state/action extraction, add or update only the relevant
  migration-state bullets.
- For a new feature folder structure, include the owner map and external
  consumers before moving logic into the folder.

The README should help the next contributor avoid falling back into the same
large component, not argue that the migration is complete.
