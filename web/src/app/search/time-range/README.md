# Global time range (LFE-10497)

The global time filter that persists across views within a project (Home ↔
Trace ↔ Sessions …). Foundation for the date picker (LFE-8156), which is the
editor that reads/writes this state.

## Owner map

- `globalDateRangeStore.ts` — global singleton Zustand store (with `persist`).
  Single source of truth for the **per-user default**, namespaced by project
  (`defaultsByProject: Record<projectId, token>`), in relative meta-format.
  Owns the localStorage boundary (one key, `langfuse-global-date-range`). The
  store is global because the default is cross-route product state; the data is
  per-project because switching projects must give each its own range.
- `useGlobalDateRange.ts` — composition hook. Pure, no effects: derives the
  displayed `TimeRange` from the URL `?dateRange=` (route source of truth) **⊕**
  the store default (presence-XOR, no merging), via `resolveTimeRange`. The only
  writer is `setTimeRange` (explicit pick) → URL + store default.
- `resolveTimeRange` / `rangeToString` / `rangeFromString` — pure encoding +
  XOR resolution, in `@/src/app/utils/date-range-utils.ts` (co-located with the
  other range utilities); covered by `date-range-utils.clienttest.ts`.

Consumers don't use these directly: `useDashboardDateRange` and
`useTableDateRange` (in `@/src/app/hooks/`) are thin per-view delegators that pass
the view's allowed presets + fallback.

## Data flow (one-way)

```
URL ?dateRange  (route SoT, explicit) ─┐
                                       ├─ resolveTimeRange (pure) ─▶ timeRange ─▶ views
store default   (per-project, persisted)┘
        ▲
   setTimeRange  ──▶ setQueryParams(URL) + store.setProjectDefault ──▶ persist→localStorage
```

The default is never auto-written to the URL: clean navigations read the store
default and leave the URL clean, so shared links carry only explicitly-set
params.

## Next slice

If project-scoped client state recurs (column/view prefs, drafts), promote the
"select this project's slice" pattern into a shared `<ProjectScope>` provider;
`useGlobalDateRange` already reads only the active project's slice, so it can
move without consumer churn.
