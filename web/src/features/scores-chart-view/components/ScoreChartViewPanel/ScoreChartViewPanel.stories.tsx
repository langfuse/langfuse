import preview from "../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { DEFAULT_SCORE_CHART_CONFIG } from "@/src/features/scores-chart-view/constants/defaultScoreChartConfig";
import { type ScoreChartViewConfig } from "@/src/features/scores-chart-view/types";
import { ScoreChartViewPanel } from "@/src/features/scores-chart-view/components/ScoreChartViewPanel/ScoreChartViewPanel";

/**
 * Deterministic fixture — average score value per hour, broken down by score
 * name. Small on purpose: `ScoreChartViewPanel` just hands `data` to the shared
 * `chart-library`, so a couple of buckets/series are enough to render a real
 * line chart.
 */
const SCORE_NAMES = [
  { name: "accuracy", base: 0.82 },
  { name: "toxicity", base: 0.04 },
];
const HOURS = ["00:00", "01:00", "02:00", "03:00"];

const DATA: DataPoint[] = HOURS.flatMap((hour, hourIndex) =>
  SCORE_NAMES.map(({ name, base }, seed) => ({
    time_dimension: hour,
    dimension: name,
    metric:
      Math.round((base + ((hourIndex + seed * 2) % 4) * 0.02) * 100) / 100,
  })),
);

/**
 * The scores-table chart layout (production UI rendered by `ScoresChartView`).
 * Presentational — `data`/`config` come in as props, so it renders without any
 * query or context dependency. Same responsive layout as the observations
 * chart view's `ChartViewPanel` story (`@/src/features/chart-view`): a config
 * panel beside the chart at desktop widths, stacked below it under the `md`
 * breakpoint — narrow the browser window (or the devtools device toolbar) to
 * ~390px to see it.
 */
const CONFIG: ScoreChartViewConfig = {
  ...DEFAULT_SCORE_CHART_CONFIG,
  metric: "value",
  aggregation: "avg",
};

const meta = preview.meta({
  component: ScoreChartViewPanel,
  args: {
    config: CONFIG,
    data: DATA,
    onConfigChange: fn(),
  },
});

export const Default = meta.story({});

export const Empty = meta.story({
  args: { data: [] },
});

export const Loading = meta.story({
  args: { isLoading: true },
});

export const Error = meta.story({
  args: { error: "Pick a wider time range to chart." },
});
