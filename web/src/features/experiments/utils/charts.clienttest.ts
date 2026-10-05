import { buildWidgetConfigFromId } from "./charts";

it("groups experiment widgets by IDs so labels cannot merge distinct runs", () => {
  for (const metricId of [
    "base:cost",
    "base:latency",
    "obs-score-numeric:accuracy",
    "obs-score-categorical:rating",
  ]) {
    expect(buildWidgetConfigFromId(metricId)?.entityDimension.field).toBe(
      "experimentId",
    );
  }
  expect(
    buildWidgetConfigFromId("experiment-score-numeric:quality")?.entityDimension
      .field,
  ).toBe("datasetRunId");
  expect(buildWidgetConfigFromId("trace-score-numeric:quality")).toBeNull();
});
