import type { DashboardDefinition } from "../server/services/DashboardService/types";

/**
 * The Langfuse-curated Home dashboard (projectId = null).
 *
 * The worker upserts it into Postgres at startup (see
 * worker/src/scripts/upsertLangfuseDashboards.ts) so it behaves like any other
 * Langfuse-maintained dashboard (listed, read-only, cloneable). The web Home
 * page fetches it by this well-known id and falls back to this constant when
 * the row does not exist yet (e.g. the worker has not run).
 *
 * All placements are "preset" placements: they render the existing Home card
 * components (registered by presetId in the web preset registry) with their
 * existing data fetches — no DashboardWidget rows, no query configuration.
 *
 * When changing the definition, bump `updatedAt` so the worker upsert
 * overwrites the existing row.
 */
export const LANGFUSE_HOME_DASHBOARD_ID = "langfuse-home-dashboard";

export const HOME_DASHBOARD_PRESET_IDS = [
  "home-traces",
  "home-model-costs",
  "home-scores-table",
  "home-traces-obs-time-series",
  "home-model-usage",
  "home-users",
  "home-chart-scores",
  "home-latency-table-traces",
  "home-latency-table-generations",
  "home-latency-table-observations",
  "home-generation-latency",
  "home-score-analytics",
] as const;

export type HomeDashboardPresetId = (typeof HOME_DASHBOARD_PRESET_IDS)[number];

const placement = (
  presetId: HomeDashboardPresetId,
  x: number,
  y: number,
  x_size: number,
  y_size: number,
) => ({
  type: "preset" as const,
  // Placement ids only need to be unique within the dashboard, so the
  // presetId doubles as a stable, readable placement id.
  id: presetId,
  presetId,
  x,
  y,
  x_size,
  y_size,
});

export const LANGFUSE_HOME_DASHBOARD_DEFINITION: DashboardDefinition = {
  widgets: [
    // Row 1: overview tables
    placement("home-traces", 0, 0, 4, 5),
    placement("home-model-costs", 4, 0, 4, 5),
    placement("home-scores-table", 8, 0, 4, 5),
    // Row 2: traffic + usage time series
    placement("home-traces-obs-time-series", 0, 5, 6, 5),
    placement("home-model-usage", 6, 5, 6, 5),
    // Row 3: users + scores over time
    placement("home-users", 0, 10, 6, 5),
    placement("home-chart-scores", 6, 10, 6, 5),
    // Row 4: latency percentile tables
    placement("home-latency-table-traces", 0, 15, 4, 5),
    placement("home-latency-table-generations", 4, 15, 4, 5),
    placement("home-latency-table-observations", 8, 15, 4, 5),
    // Row 5+: full-width analytics
    placement("home-generation-latency", 0, 20, 12, 5),
    placement("home-score-analytics", 0, 25, 12, 5),
  ],
};

export const LANGFUSE_HOME_DASHBOARD = {
  id: LANGFUSE_HOME_DASHBOARD_ID,
  name: "Langfuse Home",
  description:
    "Overview of traces, costs, scores, usage, and latencies in this project. Shown on the project home page.",
  definition: LANGFUSE_HOME_DASHBOARD_DEFINITION,
  filters: [],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};
