import { expect, it } from "vitest";
import { prepareEntitySeries } from "./prepareEntitySeries";
import { groupDataByTimeDimension } from "./utils";
import { prepareDenseSeries } from "./prepareDenseSeries";

it("keeps distinct runs with duplicate names and a missing run between them", () => {
  const data = prepareEntitySeries(
    [
      { time_dimension: "c", dimension: "score", metric: 0.8 },
      { time_dimension: "a", dimension: "score", metric: 0 },
    ],
    { a: "same name", b: "missing", c: "same name" },
  );
  expect(data).toEqual([
    { time_dimension: "a", dimension: "score", metric: 0 },
    { time_dimension: "b", dimension: undefined, metric: null },
    { time_dimension: "c", dimension: "score", metric: 0.8 },
  ]);
  const grouped = prepareDenseSeries(
    groupDataByTimeDimension(data),
    ["score"],
    "gap",
  );
  expect(grouped).toHaveLength(3);
  expect(grouped[1]).toEqual({ time_dimension: "b", score: null });
});
