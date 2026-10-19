import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { OBSERVATION_FIELD_GROUPS_FULL } from "../../domain/observation-field-groups";
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
  getEventsForAnalyticsIntegrations,
  getEventsForBlobStorageExport,
  getEventsForBlobStorageExportParquet,
  getEventsForBlobStorageExportRaw,
  getLastTraceTimestampsByProjectsFromEventsTable,
  getLatestSdkVersionInfoFromEvents,
  getObservationByIdFromEventsTable,
  getObservationMetricsForPromptsFromEvents,
  getObservationFullIOForSessionFromEventsTable,
  getObservationIOFieldByteLengthFromEventsTable,
  getObservationsBatchIOFromEventsTable,
  getObservationsTraceIdsFromEventsTable,
  getObservationsV2FromEventsTableForPublicApi,
  getObservationsWithPromptNameFromEvents,
  getSessionMetricsFromEvents,
  getTraceByIdFromEventsTable,
  getTraceMetadataByIdsFromEvents,
  hasAnySessionFromEventsTable,
  hasAnyTraceFromEventsTable,
  hasAnyUserFromEventsTable,
  streamObservationIOFieldFromEventsTable,
} from "./events";
import { getTraceBatchEventStream } from "./trace-batch";
import { ALL_SESSION_EVENTS_FIELDS } from "../queries/clickhouse-sql/event-query-builder";

const FIXED_PROJECT_ID = "golden-project";
const FIXED_PROJECT_IDS = ["golden-project", "golden-project-b"] as const;
const FIXED_TRACE_ID = "golden-trace";
const FIXED_OBSERVATION_ID = "golden-span";
const FIXED_START_TIME = new Date("2026-01-01T00:00:00.000Z");
const FIXED_FROM_TIMESTAMP = new Date("2025-12-01T00:00:00.000Z");
const FIXED_AGENT_GRAPH_MAX = new Date("2026-01-01T01:00:00.000Z");
const FIXED_TO_TIMESTAMP = new Date("2026-01-02T00:00:00.000Z");
const FIXED_PROMPT_NAMES = ["golden-prompt", "golden-prompt-b"];
const FIXED_PROMPT_IDS = ["golden-prompt-id", "golden-prompt-id-b"];
const FIXED_SESSION_IDS = ["golden-session", "golden-session-b"];

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
      minStartTime: FIXED_START_TIME,
      maxStartTime: FIXED_AGENT_GRAPH_MAX,
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

describeWithClickhouse("golden: events simple aggregates family", () => {
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

  beforeEach(() => {
    resetCaptures();
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  it("getObservationsWithPromptNameFromEvents time=unset", async () => {
    await getObservationsWithPromptNameFromEvents(
      FIXED_PROJECT_ID,
      FIXED_PROMPT_NAMES,
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationsWithPromptNameFromEvents time=from+to", async () => {
    await getObservationsWithPromptNameFromEvents(
      FIXED_PROJECT_ID,
      FIXED_PROMPT_NAMES,
      { fromTimestamp: FIXED_FROM_TIMESTAMP, toTimestamp: FIXED_TO_TIMESTAMP },
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationMetricsForPromptsFromEvents time=unset", async () => {
    await getObservationMetricsForPromptsFromEvents(
      FIXED_PROJECT_ID,
      FIXED_PROMPT_IDS,
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationMetricsForPromptsFromEvents time=from+to", async () => {
    await getObservationMetricsForPromptsFromEvents(
      FIXED_PROJECT_ID,
      FIXED_PROMPT_IDS,
      { fromTimestamp: FIXED_FROM_TIMESTAMP, toTimestamp: FIXED_TO_TIMESTAMP },
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each([
    ["from", { fromTimestamp: FIXED_FROM_TIMESTAMP }],
    ["to", { toTimestamp: FIXED_TO_TIMESTAMP }],
  ] as const)(
    "getObservationsWithPromptNameFromEvents time=%s",
    async (_, timeWindow) => {
      await getObservationsWithPromptNameFromEvents(
        FIXED_PROJECT_ID,
        FIXED_PROMPT_NAMES,
        timeWindow,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it.each([
    ["from", { fromTimestamp: FIXED_FROM_TIMESTAMP }],
    ["to", { toTimestamp: FIXED_TO_TIMESTAMP }],
  ] as const)(
    "getObservationMetricsForPromptsFromEvents time=%s",
    async (_, timeWindow) => {
      await getObservationMetricsForPromptsFromEvents(
        FIXED_PROJECT_ID,
        FIXED_PROMPT_IDS,
        timeWindow,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("getObservationsWithPromptNameFromEvents promptNames=empty", async () => {
    await getObservationsWithPromptNameFromEvents(FIXED_PROJECT_ID, []);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationMetricsForPromptsFromEvents promptIds=empty", async () => {
    await getObservationMetricsForPromptsFromEvents(FIXED_PROJECT_ID, []);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionMetricsFromEvents sessionIds=empty", async () => {
    await getSessionMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      sessionIds: [],
      fields: ["session_id", "trace_count"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionMetricsFromEvents sessionIds=set", async () => {
    await getSessionMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      sessionIds: FIXED_SESSION_IDS,
      fields: ["session_id", "trace_count"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionMetricsFromEvents sessionIds=set+queryFromTimestamp", async () => {
    await getSessionMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      sessionIds: FIXED_SESSION_IDS,
      fields: ["session_id", "trace_count"],
      queryFromTimestamp: FIXED_FROM_TIMESTAMP,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionMetricsFromEvents fields=all", async () => {
    await getSessionMetricsFromEvents({
      projectId: FIXED_PROJECT_ID,
      sessionIds: FIXED_SESSION_IDS,
      fields: ALL_SESSION_EVENTS_FIELDS,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getLatestSdkVersionInfoFromEvents", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_START_TIME);
    await getLatestSdkVersionInfoFromEvents({ projectId: FIXED_PROJECT_ID });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describeWithClickhouse("golden: events IO payload reads family", () => {
  const observations = [
    { id: FIXED_OBSERVATION_ID, traceId: FIXED_TRACE_ID },
    { id: "golden-span-b", traceId: FIXED_TRACE_ID },
    { id: "golden-span-c", traceId: "golden-trace-b" },
  ];
  const batchBase = {
    projectId: FIXED_PROJECT_ID,
    observations,
    minStartTime: FIXED_FROM_TIMESTAMP,
    maxStartTime: FIXED_START_TIME,
  };
  const ioRead = {
    projectId: FIXED_PROJECT_ID,
    traceId: FIXED_TRACE_ID,
    observationId: FIXED_OBSERVATION_ID,
    startTime: FIXED_START_TIME,
  };

  beforeEach(() => {
    resetCaptures();
  });

  it("getObservationsBatchIOFromEventsTable truncated", async () => {
    await getObservationsBatchIOFromEventsTable(batchBase);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationsBatchIOFromEventsTable full", async () => {
    await getObservationsBatchIOFromEventsTable({
      ...batchBase,
      truncated: false,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getObservationsBatchIOFromEventsTable full+ioCharLimit+experiment+toolCalls+skills", async () => {
    await getObservationsBatchIOFromEventsTable({
      ...batchBase,
      truncated: false,
      ioCharLimit: 5000.7,
      includeExperimentFields: true,
      includeToolCallFields: true,
      includeSkillFields: true,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each([
    ["truncated", true],
    ["full", false],
  ] as const)(
    "getObservationsBatchIOFromEventsTable %s+experiment",
    async (_, truncated) => {
      await getObservationsBatchIOFromEventsTable({
        ...batchBase,
        truncated,
        includeExperimentFields: true,
      });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("getObservationsBatchIOFromEventsTable truncated+sessionId", async () => {
    await getObservationsBatchIOFromEventsTable({
      ...batchBase,
      sessionId: "golden-session",
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each(["input", "output", "metadata"] as const)(
    "getObservationIOFieldByteLengthFromEventsTable field=%s",
    async (field) => {
      await getObservationIOFieldByteLengthFromEventsTable({
        ...ioRead,
        field,
      });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it.each(["input", "output", "metadata"] as const)(
    "streamObservationIOFieldFromEventsTable field=%s",
    async (field) => {
      await streamObservationIOFieldFromEventsTable({ ...ioRead, field });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("getObservationFullIOForSessionFromEventsTable", async () => {
    await getObservationFullIOForSessionFromEventsTable({
      ...ioRead,
      sessionId: "golden-session",
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describeWithClickhouse(
  "golden: events metadata map and session resolution",
  () => {
    beforeEach(() => {
      resetCaptures();
    });

    it("getObservationsV2FromEventsTableForPublicApi fields=core+metadata expandMetadataKeys=set", async () => {
      await getObservationsV2FromEventsTableForPublicApi({
        projectId: FIXED_PROJECT_ID,
        page: 1,
        limit: 50,
        fields: ["core", "metadata"],
        expandMetadataKeys: ["golden-key"],
      });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("getObservationsV2FromEventsTableForPublicApi fields=basic+metrics+trace_context", async () => {
      await getObservationsV2FromEventsTableForPublicApi({
        projectId: FIXED_PROJECT_ID,
        page: 1,
        limit: 50,
        fields: ["basic", "metrics", "trace_context"],
      });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("getEventsForAnalyticsIntegrations", async () => {
      for await (const _ of getEventsForAnalyticsIntegrations(
        FIXED_PROJECT_ID,
        "golden-project-name",
        FIXED_FROM_TIMESTAMP,
        FIXED_START_TIME,
      )) {
        // The harness streams no rows.
      }
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("getTraceBatchEventStream", async () => {
      for await (const _ of getTraceBatchEventStream({
        traces: [
          {
            projectId: FIXED_PROJECT_ID,
            traceId: FIXED_TRACE_ID,
            minStart: FIXED_FROM_TIMESTAMP.getTime(),
            maxStart: FIXED_START_TIME.getTime(),
          },
        ],
      })) {
        // The harness streams no rows.
      }
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  },
);

describeWithClickhouse("golden: events export streams family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  // The harness only records a stream's query once it is iterated.
  async function drain(rows: AsyncIterable<unknown>) {
    for await (const _ of rows) {
      // The harness streams no rows.
    }
  }

  it("getEventsForBlobStorageExport fieldGroups=default", async () => {
    await drain(
      getEventsForBlobStorageExport(
        FIXED_PROJECT_ID,
        FIXED_FROM_TIMESTAMP,
        FIXED_TO_TIMESTAMP,
      ),
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each(OBSERVATION_FIELD_GROUPS_FULL)(
    "getEventsForBlobStorageExport fieldGroups=%s",
    async (group) => {
      await drain(
        getEventsForBlobStorageExport(
          FIXED_PROJECT_ID,
          FIXED_FROM_TIMESTAMP,
          FIXED_TO_TIMESTAMP,
          [group],
        ),
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("getEventsForBlobStorageExport fieldGroups=empty", async () => {
    await drain(
      getEventsForBlobStorageExport(
        FIXED_PROJECT_ID,
        FIXED_FROM_TIMESTAMP,
        FIXED_TO_TIMESTAMP,
        [],
      ),
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getEventsForBlobStorageExport fieldGroups=reversed", async () => {
    await drain(
      getEventsForBlobStorageExport(
        FIXED_PROJECT_ID,
        FIXED_FROM_TIMESTAMP,
        FIXED_TO_TIMESTAMP,
        [...OBSERVATION_FIELD_GROUPS_FULL].reverse(),
      ),
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each([
    ["default", undefined, undefined],
    ["default", true, [...OBSERVATION_FIELD_GROUPS_FULL]],
    ["metrics", true, ["metrics"]],
    ["core+io", true, ["core", "io"]],
  ] as const)(
    "getEventsForBlobStorageExportRaw fieldGroups=%s convertLatencyToSeconds=%s",
    async (_name, convertLatencyToSeconds, fieldGroups) => {
      await drain(
        getEventsForBlobStorageExportRaw(
          FIXED_PROJECT_ID,
          FIXED_FROM_TIMESTAMP,
          FIXED_TO_TIMESTAMP,
          fieldGroups ? [...fieldGroups] : undefined,
          convertLatencyToSeconds,
        ),
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it.each([false, true])(
    "getEventsForBlobStorageExportParquet convertLatencyToSeconds=%s",
    async (convertLatencyToSeconds) => {
      await getEventsForBlobStorageExportParquet(
        FIXED_PROJECT_ID,
        FIXED_FROM_TIMESTAMP,
        FIXED_TO_TIMESTAMP,
        undefined,
        convertLatencyToSeconds,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );
});
