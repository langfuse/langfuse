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

  // The reason the rule changed: the alphabetically first score was a language
  // check recorded on a handful of items, and it opened the page.
  it("prefers coverage over the alphabetically first name", () => {
    expect(
      pickDefaultStripMetric(
        buildMetricOptions({
          obs_scores_avg: ["accuracy", "groundedness"],
        }),
        {
          obs: new Map([
            ["accuracy", 3],
            ["groundedness", 120],
          ]),
        },
      ),
    ).toBe("obs-score-numeric:groundedness");
  });

  it("ranks a boolean score below a numeric one whatever its coverage", () => {
    expect(
      pickDefaultStripMetric(
        buildMetricOptions({
          trace_scores_avg: ["answered_in_right_language", "groundedness"],
          trace_score_booleans: ["answered_in_right_language"],
        }),
        {
          trace: new Map([
            ["answered_in_right_language", 400],
            ["groundedness", 12],
          ]),
        },
      ),
    ).toBe("trace-score-numeric:groundedness");
  });

  // Coverage is per level, and the aggregate keys it is counted under carry
  // normalized names ("." and "-" become "_").
  it("resolves coverage per level and through name normalization", () => {
    const options = buildMetricOptions({
      obs_scores_avg: ["judge.verdict"],
      trace_scores_avg: ["judge.verdict"],
    });
    expect(
      pickDefaultStripMetric(options, {
        obs: new Map([["judge_verdict", 2]]),
        trace: new Map([["judge_verdict", 90]]),
      }),
    ).toBe("trace-score-numeric:judge.verdict");
  });

  // Without coverage the order must still be total, so the strip does not
  // switch metrics between renders while the row metrics are in flight.
  it("is stable when no coverage is known", () => {
    const options = buildMetricOptions({
      obs_scores_avg: ["groundedness"],
      trace_scores_avg: ["groundedness"],
    });
    expect(pickDefaultStripMetric(options)).toBe(
      "obs-score-numeric:groundedness",
    );
    expect(pickDefaultStripMetric(options)).toBe(
      pickDefaultStripMetric(options),
    );
  });
});
