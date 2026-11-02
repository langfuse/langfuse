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
import {
  getDatasetExperimentMetricsFromEvents,
  getExperimentMetricsFromEvents,
  getExperimentsCountFromEvents,
  getExperimentsFromEvents,
} from "../index";

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

  it("getDatasetExperimentMetricsFromEvents", async () => {
    await getDatasetExperimentMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      datasetIds: ["golden-dataset"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getExperimentsFromEvents filter=none", async () => {
    await getExperimentsFromEvents({
      projectId: FIXED_PROJECT_ID,
      filter: [],
      limit: 50,
      page: 0,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getExperimentsCountFromEvents filter=experimentIds+startTime", async () => {
    await getExperimentsCountFromEvents({
      projectId: FIXED_PROJECT_ID,
      filter: [
        {
          type: "stringOptions",
          column: "id",
          operator: "any of",
          value: FIXED_EXPERIMENT_IDS,
        },
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: new Date("2025-12-01T00:00:00.000Z"),
        },
      ],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
