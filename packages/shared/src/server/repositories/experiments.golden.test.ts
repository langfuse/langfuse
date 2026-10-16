import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "./goldenHarness";

vi.mock("./clickhouse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clickhouse")>();
  const { buildClickhouseMock } = await import("./goldenHarness.js");
  return buildClickhouseMock(actual);
});

// Enter through the server barrel: importing ./experiments directly hits the
// db -> server-barrel -> events import cycle before events.ts initializes.
import { getExperimentMetricsFromEvents } from "../index";

const FIXED_PROJECT_ID = "golden-project";
const FIXED_EXPERIMENT_IDS = ["golden-experiment", "golden-experiment-b"];

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

describeWithClickhouse("golden: experiments simple aggregates family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getExperimentMetricsFromEvents experimentIds=empty", async () => {
    await getExperimentMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      experimentIds: [],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getExperimentMetricsFromEvents experimentIds=set", async () => {
    await getExperimentMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      experimentIds: FIXED_EXPERIMENT_IDS,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
