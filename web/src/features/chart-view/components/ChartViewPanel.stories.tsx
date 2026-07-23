import preview from "../../../../.storybook/preview";
import { fn } from "storybook/test";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { ChartViewPanel } from "./ChartViewPanel";
import { DEFAULT_CONFIG } from "../vocab";

/**
 * Deterministic fixture — count of events per hour, broken down by model.
 * Small on purpose: `ChartViewPanel` just hands `data` to the shared
 * `chart-library`, so a couple of buckets/series are enough to render a real
 * line chart.
 */
const MODELS = [
  { name: "gpt-4o", base: 12 },
  { name: "claude-3-5-sonnet", base: 8 },
];
const HOURS = ["00:00", "01:00", "02:00", "03:00"];

const DATA: DataPoint[] = HOURS.flatMap((hour, hourIndex) =>
  MODELS.map(({ name, base }, seed) => ({
    time_dimension: hour,
    dimension: name,
    metric: base + ((hourIndex + seed * 2) % 4) * 3,
  })),
);

/**
 * The "Take B" chart-view layout: a maximized canvas with the "Visualize"
 * config docked in a collapsible panel (`EventsChartView`'s production UI).
 * Presentational — `data`/`config` come in as props, so it renders without
 * any query or context dependency.
 *
 * The panel's outer row is `flex-col md:flex-row` (LFE-11067): a config panel
 * beside the chart at desktop widths, stacked below it under the `md`
 * breakpoint. That's a real viewport-width media query, not a container
 * query, so — unlike most other layout stories in this repo — a fixed-width
 * wrapper `<div>` here would only clip the desktop layout rather than trigger
 * the stack (this Storybook setup has no viewport-switching addon wired up).
 * To see the mobile layout, narrow the actual browser window or the devtools
 * device toolbar to ~390px while viewing this story — the preview iframe is
 * fluid-width, so the same media query that fires on a phone fires there too.
 */
const meta = preview.meta({
  component: ChartViewPanel,
  args: {
    config: DEFAULT_CONFIG,
    data: DATA,
    onConfigChange: fn(),
  },
  decorators: [
    // `ChartViewPanel`'s root relies on a bounded-height flex ancestor
    // (`flex-1`/`min-h-0`) — same as its production host (`EventsChartView`
    // inside the events table) — so give it one here.
    (Story) => (
      <div className="flex h-[420px] flex-col">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});
