import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import { LangfuseNotFoundError } from "../../errors";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "./goldenHarness";

// Record the exec seam instead of hitting ClickHouse. The factory is hoisted
// above imports, so it pulls the harness in via dynamic import; the captured
// store is a module singleton shared with the assertions below.
vi.mock("./clickhouse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clickhouse")>();
  const { buildClickhouseMock } = await import("./goldenHarness.js");
  return buildClickhouseMock(actual);
});

import {
  getAgentGraphDataFromEventsTable,
  getLastTraceTimestampsByProjectsFromEventsTable,
  getObservationByIdFromEventsTable,
  getObservationsTraceIdsFromEventsTable,
  getTraceByIdFromEventsTable,
  getTraceMetadataByIdsFromEvents,
  hasAnySessionFromEventsTable,
  hasAnyTraceFromEventsTable,
  hasAnyUserFromEventsTable,
} from "./events";

const FIXED_PROJECT_ID = "golden-project";
const FIXED_PROJECT_IDS = ["golden-project", "golden-project-b"] as const;
const FIXED_TRACE_ID = "golden-trace";
const FIXED_OBSERVATION_ID = "golden-span";
const FIXED_START_TIME = new Date("2026-01-01T00:00:00.000Z");
const FIXED_FROM_TIMESTAMP = new Date("2025-12-01T00:00:00.000Z");
const FIXED_CH_MIN = "2026-01-01 00:00:00.000";
const FIXED_CH_MAX = "2026-01-01 01:00:00.000";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

async function captureObservationById(
  args: Parameters<typeof getObservationByIdFromEventsTable>[0],
) {
  try {
    await getObservationByIdFromEventsTable(args);
  } catch (error) {
    // The harness returns no rows; the wrapper throws after the exec seam.
    if (!(error instanceof LangfuseNotFoundError)) throw error;
  }
}

describeWithClickhouse("golden: events point-reads & existence family", () => {
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

  beforeEach(() => {
    resetCaptures();
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  });
  afterAll(() => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  it("hasAnyTraceFromEventsTable", async () => {
    await hasAnyTraceFromEventsTable(FIXED_PROJECT_ID);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("hasAnyUserFromEventsTable", async () => {
    await hasAnyUserFromEventsTable(FIXED_PROJECT_ID);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("hasAnySessionFromEventsTable", async () => {
    await hasAnySessionFromEventsTable(FIXED_PROJECT_ID);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getLastTraceTimestampsByProjectsFromEventsTable projectIds=empty", async () => {
    await getLastTraceTimestampsByProjectsFromEventsTable({ projectIds: [] });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getLastTraceTimestampsByProjectsFromEventsTable projectIds=one", async () => {
    await getLastTraceTimestampsByProjectsFromEventsTable({
      projectIds: [FIXED_PROJECT_ID],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getLastTraceTimestampsByProjectsFromEventsTable projectIds=many", async () => {
    await getLastTraceTimestampsByProjectsFromEventsTable({
      projectIds: [...FIXED_PROJECT_IDS],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getAgentGraphDataFromEventsTable", async () => {
    await getAgentGraphDataFromEventsTable({
      projectId: FIXED_PROJECT_ID,
      traceId: FIXED_TRACE_ID,
      chMinStartTime: FIXED_CH_MIN,
      chMaxStartTime: FIXED_CH_MAX,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationsTraceIdsFromEventsTable", async () => {
    await getObservationsTraceIdsFromEventsTable({
      projectId: FIXED_PROJECT_ID,
      observationIds: [FIXED_OBSERVATION_ID, "golden-span-b"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceMetadataByIdsFromEvents traceIds=empty", async () => {
    await getTraceMetadataByIdsFromEvents({
      projectId: FIXED_PROJECT_ID,
      traceIds: [],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceMetadataByIdsFromEvents traceIds=set", async () => {
    await getTraceMetadataByIdsFromEvents({
      projectId: FIXED_PROJECT_ID,
      traceIds: [FIXED_TRACE_ID, "golden-trace-b"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationByIdFromEventsTable base", async () => {
    await captureObservationById({
      id: FIXED_OBSERVATION_ID,
      projectId: FIXED_PROJECT_ID,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationByIdFromEventsTable startTime+type+traceId", async () => {
    await captureObservationById({
      id: FIXED_OBSERVATION_ID,
      projectId: FIXED_PROJECT_ID,
      startTime: FIXED_START_TIME,
      startTimeLowerBound: FIXED_FROM_TIMESTAMP,
      type: "GENERATION",
      traceId: FIXED_TRACE_ID,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationByIdFromEventsTable io=truncated", async () => {
    await captureObservationById({
      id: FIXED_OBSERVATION_ID,
      projectId: FIXED_PROJECT_ID,
      fetchWithInputOutput: true,
      renderingProps: { truncated: true, shouldJsonParse: true },
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationByIdFromEventsTable io=full", async () => {
    await captureObservationById({
      id: FIXED_OBSERVATION_ID,
      projectId: FIXED_PROJECT_ID,
      fetchWithInputOutput: true,
      renderingProps: { truncated: false, shouldJsonParse: true },
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceByIdFromEventsTable base", async () => {
    await getTraceByIdFromEventsTable({
      traceId: FIXED_TRACE_ID,
      projectId: FIXED_PROJECT_ID,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceByIdFromEventsTable timestamp+fromTimestamp", async () => {
    await getTraceByIdFromEventsTable({
      traceId: FIXED_TRACE_ID,
      projectId: FIXED_PROJECT_ID,
      timestamp: FIXED_START_TIME,
      fromTimestamp: FIXED_FROM_TIMESTAMP,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceByIdFromEventsTable excludeInputOutput+excludeMetadata", async () => {
    await getTraceByIdFromEventsTable({
      traceId: FIXED_TRACE_ID,
      projectId: FIXED_PROJECT_ID,
      excludeInputOutput: true,
      excludeMetadata: true,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTraceByIdFromEventsTable truncated", async () => {
    await getTraceByIdFromEventsTable({
      traceId: FIXED_TRACE_ID,
      projectId: FIXED_PROJECT_ID,
      renderingProps: { truncated: true, shouldJsonParse: true },
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
