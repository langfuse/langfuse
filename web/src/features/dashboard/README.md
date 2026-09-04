# Dashboard Feature

## Surface

Dashboards: the project Home page (a read-only dashboard viewer), the
self-serve dashboard detail page, and the legacy curated Home cards that render
as "preset" placements.

## Entry Points

- `web/src/pages/project/[projectId]/index.tsx` — Home. Controller resolves the
  v3/v4 read path before anything mounts, then renders `HomeDashboard`.
- `web/src/pages/project/[projectId]/dashboards/[dashboardId]/index.tsx` —
  dashboard detail. Same controller split (`DashboardDetailView`).
- Both pages create the per-mount scheduler store and provide it via
  `DashboardQuerySchedulerProvider`.

## Structure

- `components/` — the legacy curated Home cards (TracesBarListChart,
  ModelCostTable, …) rendered by `home-preset-registry.tsx` as preset
  placements, plus dashboard-scoped dialogs/selectors. Cards receive a
  **required** `metricsVersion` from the preset context — they never read the
  session themselves.
- `hooks/` — `useDashboardQueryScheduler.tsx`: the scheduler controller hook,
  provider/context, executeQuery cache policy, and
  `useScheduledDashboardExecuteQuery` (the one entry point widgets use to run
  a dashboard query under the concurrency budget, over tRPC or SSE).
- `stores/` — `dashboardQuerySchedulerStore.ts`: per-mount vanilla Zustand
  store owning the widget query queue (register/unregister/markDone/
  resetQueue/setMaxConcurrent). Created by the page, provided via context,
  destroyed on unmount.
- `server/` — `dashboard-router.ts` (tRPC). `executeQuery` requires an
  explicit `version` and validates v2 against the session's read path.
- `lib/`, `utils/` — pure helpers (table href building, import/export).

Related but outside this folder: `web/src/features/widgets/` owns
`DashboardGrid` / `DashboardWidget` / `WidgetContent` and the chart library;
`web/src/hooks/useSSEDashboardQuery.ts` owns the SSE transport (kept there
because `parseSSEBuffer` has non-dashboard consumers).

## State Ownership

- **Server/query state**: React Query. Both transports (tRPC fetch and the SSE
  stream) cache rows under the same `["dashboard.executeQuery", input, retry]`
  key, so identical widgets share one query/stream and a transport flip reuses
  cached rows.
- **Read path (v3/v4)**: session state, resolved by the page controller and
  passed down as a required `readPath` prop — never mirrored into a store.
- **Scheduler queue**: the per-mount vanilla store above. Widgets subscribe to
  `items[queryId]?.status === "running"` only.
- **SSE progress events**: high-frequency; deliberately kept OUT of the query
  cache as local state on the mount that initiated the stream.
- **Route state**: time range / filters / peeked dashboard live in the URL
  hooks on the pages.

## Performance And Stability Boundaries

- Scheduler slot changes re-render only the widget whose slot changed — never
  the page (the store replaced a page-level `useState` version counter that
  re-rendered the whole grid on every queue transition).
- Progress events re-render one widget's loading state at ClickHouse's
  progress cadence; they must never enter the query cache or context values.
- The scheduler reset key must contain only query-affecting params — never the
  widget set (`useDashboardQueryScheduler.clienttest.ts` pins this).

## Reliability Invariants

- A widget query releases its scheduler slot on every terminal path — success,
  error, stall (60s no-byte watchdog aborts the stream), or unmount
  (unregister). A held slot at 90d windows (budget: 2) freezes the dashboard.
- The SSE endpoint sets `cancel_http_readonly_queries_on_client_close`, so
  when the browser disconnects (the handler breaks and the ClickHouse stream
  socket closes) the server kills the query instead of running the abandoned
  aggregation to completion; `max_execution_time` bounds any straggler.

## Migration State

- Done: controller split for the read path; scheduler on a per-mount vanilla
  store; SSE rows/status in the React Query cache; per-widget reactive slot
  subscriptions.
- Still spread: the dashboard detail page is a single large component (draft
  definition state, paste/import handlers, clone-first dialog state all
  inline); the legacy preset cards fetch through bespoke `dashboard.chart`
  query names. Next slice: extract the detail page's paste/import workflows
  into `actions/*.ts`.

## Development Context

Read `.agents/skills/frontend-large-feature-architecture/SKILL.md` (and its
`references/local-feature-state.md`) before adding state or effects here. For
chart/formatting work, `web/src/features/widgets/chart-library/ARCHITECTURE.md`
owns the data → preparer → visualiser contract.
