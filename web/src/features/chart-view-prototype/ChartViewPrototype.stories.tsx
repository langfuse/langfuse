import preview from "../../../.storybook/preview";
import { ChartViewPrototype } from "./components/ChartViewPrototype";
import { SCENARIOS } from "./lib/fixtures";
import { type ChartViewConfig } from "./types";

/**
 * "Any view is a chart" — the v4 events/traces view, flipped from table to a
 * configurable chart in place. These stories ARE the design: built on mock
 * fixtures (no backend), reusing the production `chart-library`, comparing two
 * UX takes on where the chart config lives.
 *
 *  • Take A — Inline bar: config in a compact, always-on strip above the canvas.
 *  • Take B — Side panel: a maximized canvas with config docked in a panel.
 *
 * Both share the same toggle, the same pure aggregator, and the same mocked
 * "Ask AI → chart" affordance — they differ only in how the config is presented.
 */
const meta = preview.meta({
  component: ChartViewPrototype,
  args: {
    events: SCENARIOS.default,
    affordance: "inline",
    initialMode: "chart",
  },
  argTypes: {
    affordance: {
      control: "inline-radio",
      options: ["inline", "panel"],
    },
    initialMode: {
      control: "inline-radio",
      options: ["table", "chart"],
    },
  },
  decorators: [
    // A definite-height frame so the (h-full) prototype and its charts size
    // correctly in the Storybook canvas.
    (Story) => (
      <div className="mx-auto h-[680px] w-full max-w-6xl p-4">
        <Story />
      </div>
    ),
  ],
});

const PRESETS = {
  latencyP95: {
    metric: "latency",
    aggregation: "p95",
    breakdown: "model",
    chartType: "LINE_TIME_SERIES",
    timeGranularity: "hour",
  },
  costByModel: {
    metric: "totalCost",
    aggregation: "sum",
    breakdown: "model",
    chartType: "HORIZONTAL_BAR",
    timeGranularity: "hour",
  },
  eventsByLevel: {
    metric: "count",
    aggregation: "count",
    breakdown: "level",
    chartType: "PIE",
    timeGranularity: "hour",
  },
} satisfies Record<string, ChartViewConfig>;

/** Take A — the inline explorer bar. The flagship; the default config is
 *  count-of-events broken down by model over time. */
export const TakeA_InlineBar = meta.story({
  args: { events: SCENARIOS.default, affordance: "inline" },
});

/** Take B — the same experience with config docked in a collapsible panel and
 *  a maximized chart canvas. */
export const TakeB_SidePanel = meta.story({
  args: { events: SCENARIOS.default, affordance: "panel" },
});

/** The starting point: the familiar events table. Flip the toggle (top right)
 *  to chart. */
export const TableView = meta.story({
  args: { events: SCENARIOS.default, initialMode: "table" },
});

/** Ask AI → chart. Type an ask (or tap a suggestion) and the chart
 *  reconfigures. Try "errors over time by level" against this error-spike
 *  dataset. */
export const AskAI = meta.story({
  args: {
    events: SCENARIOS.errorSpike,
    affordance: "inline",
    initialConfig: PRESETS.eventsByLevel,
  },
});

export const LatencyP95ByModel = meta.story({
  args: {
    events: SCENARIOS.default,
    affordance: "inline",
    initialConfig: PRESETS.latencyP95,
  },
});

export const CostByModelRanked = meta.story({
  args: {
    events: SCENARIOS.default,
    affordance: "panel",
    initialConfig: PRESETS.costByModel,
  },
});

export const EventsByLevelPie = meta.story({
  args: {
    events: SCENARIOS.default,
    affordance: "inline",
    initialConfig: PRESETS.eventsByLevel,
  },
});

/** No data — the empty state inside the chart canvas. */
export const EmptyState = meta.story({
  args: { events: SCENARIOS.empty },
});

/** Both takes stacked for a direct side-by-side comparison. */
export const Comparison = meta.story({
  render: () => (
    <div className="flex h-full flex-col gap-8 overflow-y-auto">
      <div className="flex shrink-0 flex-col gap-2">
        <h3 className="text-sm font-bold">Take A — Inline explorer bar</h3>
        <p className="text-muted-foreground text-xs">
          Config in an always-on strip above the canvas. Dense, fast, feels like
          a live extension of the table.
        </p>
        <div className="h-[460px]">
          <ChartViewPrototype events={SCENARIOS.default} affordance="inline" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <h3 className="text-sm font-bold">Take B — Docked side panel</h3>
        <p className="text-muted-foreground text-xs">
          Maximized canvas with config in a collapsible panel. Cleaner, more
          guided, more room for the chart.
        </p>
        <div className="h-[460px]">
          <ChartViewPrototype events={SCENARIOS.default} affordance="panel" />
        </div>
      </div>
    </div>
  ),
});
