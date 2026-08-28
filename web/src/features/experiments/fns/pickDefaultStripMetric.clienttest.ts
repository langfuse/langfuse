import { describe, expect, it } from "vitest";

import { pickDefaultStripMetric } from "./pickDefaultStripMetric";
import { buildMetricOptions } from "@/src/features/experiments/utils/charts";

describe("pickDefaultStripMetric", () => {
  it("opens on the first numeric score, not on cost", () => {
    expect(
      pickDefaultStripMetric(
        buildMetricOptions({
          obs_scores_avg: ["groundedness", "accuracy"],
          obs_score_categories: { verdict: ["pass", "fail"] },
        }),
      ),
    ).toBe("obs-score-numeric:accuracy");
  });

  it("falls back to a categorical score, then to cost", () => {
    expect(
      pickDefaultStripMetric(
        buildMetricOptions({ obs_score_categories: { verdict: ["pass"] } }),
      ),
    ).toBe("obs-score-categorical:verdict");
    expect(pickDefaultStripMetric(buildMetricOptions({}))).toBe("base:cost");
  });
});
