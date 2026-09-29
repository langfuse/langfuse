import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { ScoreOutlierStripHeader } from "@/src/features/scores-chart-view/components/ScoreOutlierStripHeader";

/**
 * Design surface for the outlier strip's controls row — isolated from
 * `ScoresOutlierStrip` (which needs a live `dashboard.executeQuery`) so
 * purely visual concerns, like the value-mode info icon's alignment against
 * the text-based mode/aggregation triggers, can be checked without the rest
 * of the app.
 */
const meta = preview.meta({
  component: ScoreOutlierStripHeader,
  args: {
    onModeChange: fn(),
    onAggregationChange: fn(),
  },
});

export const CountMode = meta.story({
  args: {
    mode: "count",
    aggregation: "count",
    aggOptions: ["count"],
  },
});

/** "Value" mode adds the info icon flagging that categorical/text scores are
 * excluded, next to the aggregation dropdown (avg/min/max). */
export const ValueMode = meta.story({
  args: {
    mode: "value",
    aggregation: "avg",
    aggOptions: ["avg", "min", "max"],
  },
});
