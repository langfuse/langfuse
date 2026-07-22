# chart-view-prototype

**Status: throwaway design prototype (EXP-CHART-PROTOTYPE, phase 0).** Storybook-only,
mock-data-only. This folder exists so we can _design by building_ the "any view is a
chart" experience for the v4 events/traces view before wiring it to real data. Nothing
here is imported by the app yet.

## The experience

In the v4 events view, flip **table → chart** and configure the visualization in place
(**metric × aggregation × breakdown × chart-type**), with an **Ask AI** affordance that
emits that config from natural language. We ship **two UX takes** for the config
affordance and let Nikita pick the direction:

- **Take A — inline bar:** config in a compact, always-on strip above the canvas.
- **Take B — side panel:** a maximized canvas with config in a collapsible dock.

Run the stories: `pnpm --filter web run storybook` → **Charts / Chart View Prototype**.

## Owner map

| File                                | Owns                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                          | The config spec (`ChartViewConfig`) + the mock event row (`PrototypeEvent`).                                                                                       |
| `vocab.ts`                          | Metric / dimension / aggregation / chart-type vocabulary (a faithful subset of the real widget vocabulary), value extractors, and config coercion. Pure, no React. |
| `lib/aggregate.ts`                  | **The data layer.** Pure `aggregateEvents(events, config) → DataPoint[]` — mirrors the shape the future v4 aggregate endpoint must return.                         |
| `lib/fixtures.ts`                   | Deterministic (seeded) mock event generator + named scenarios.                                                                                                     |
| `components/ChartViewPrototype.tsx` | Root: owns the `mode` + `config` state, renders one of the two takes. Everything below is view-only.                                                               |
| `components/ChartCanvas.tsx`        | `React.memo` chart render boundary (derives data, renders `chart-library`).                                                                                        |
| `components/ConfigControls.tsx`     | The shared, view-only pickers (metric/agg/breakdown/granularity/chart-type).                                                                                       |
| `components/MockEventsTable.tsx`    | Representative "table" side of the toggle.                                                                                                                         |
| `components/ViewModeToggle.tsx`     | The table↔chart toggle.                                                                                                                                            |
| `ChartViewPrototype.stories.tsx`    | The stories (the actual deliverable).                                                                                                                              |

## Architecture notes (follows `frontend-large-feature-architecture`)

- **Pure derivation:** all data transformation lives in `lib/aggregate.ts`; components
  are view-only and just render derived data. Same events + config → same chart.
- **One-way data flow:** the root owns `mode` + `config`; children receive values +
  stable `onChange` callbacks (memoized), nothing reaches back up except via those.
- **Render boundaries:** `ChartCanvas` and the pickers are `React.memo`'d so a single
  config change doesn't re-aggregate or re-render unrelated UI.

## Wiring path (later phases — not in this folder yet)

1. **Phase 1:** replace `lib/aggregate.ts`'s client function with a tRPC `events.aggregate`
   call returning the same `DataPoint[]`; move `mode` + `config` into URL state
   (reversible toggle); mount inside `features/events/components/EventsTable.tsx`, gated
   to the v4 read path.
