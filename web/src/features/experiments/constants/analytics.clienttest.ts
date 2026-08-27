import { describeStripMetric } from "@/src/features/experiments/constants/analytics";

// The strip's metric id embeds the score NAME, which is user content: only the
// shape may reach PostHog. (LFE-15720)
describe("describeStripMetric", () => {
  it("reports base metrics without a score level", () => {
    expect(describeStripMetric("base:cost")).toEqual({
      metricGroup: "base",
      scoreLevel: "none",
    });
  });

  it("reports a score's level in full words and drops its name", () => {
    expect(describeStripMetric("obs-score-numeric:groundedness")).toEqual({
      metricGroup: "score",
      scoreLevel: "observation",
    });
    expect(
      describeStripMetric("trace-score-categorical:judge_verdict"),
    ).toEqual({ metricGroup: "score", scoreLevel: "trace" });
    expect(describeStripMetric("experiment-score-numeric:accuracy")).toEqual({
      metricGroup: "score",
      scoreLevel: "experiment",
    });
  });
});
