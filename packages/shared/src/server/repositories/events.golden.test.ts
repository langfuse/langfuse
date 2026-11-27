// Golden SQL for the events repository read families (point reads,
// aggregates, IO, exports, row selection, filtered streams).

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { OBSERVATION_FIELD_GROUPS_FULL } from "../../domain/observation-field-groups";
import { eventsTableTraceNameAggregationSql } from "../../eventsTable";
import { env } from "../../env";
import { LangfuseNotFoundError } from "../../errors/NotFoundError";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  formatSql,
  normalizeCapturedQueries,
  resetCaptures,
} from "./__tests__/goldenHarness";

// Record the exec seam instead of hitting ClickHouse. The factory is hoisted
// above imports, so it pulls the harness in via dynamic import; the captured
// store is a module singleton shared with the assertions below.
vi.mock("./clickhouse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clickhouse")>();
  const { buildClickhouseMock } = await import("./__tests__/goldenHarness.js");
  return buildClickhouseMock(actual);
});

import {
  getAgentGraphDataFromEventsTable,
  getEventsForAnalyticsIntegrations,
  getEventsForBlobStorageExport,
  getEventsForBlobStorageExportParquet,
  getEventsForBlobStorageExportRaw,
  getGatewayApiKeysLastUsedAtFromEvents,
  getGatewaySpendSinceFromEvents,
  getLastTraceTimestampsByProjectsFromEventsTable,
  getLatestSdkVersionInfoFromEvents,
  getObservationByIdFromEventsTable,
  getObservationMetricsForPromptsFromEvents,
  getObservationFullIOForSessionFromEventsTable,
  getObservationIOFieldByteLengthFromEventsTable,
  getObservationsBatchIOFromEventsTable,
  getObservationsTraceIdsFromEventsTable,
  getObservationsCountFromEventsTableForPublicApi,
  getObservationsFromEventsTableForPublicApi,
  getObservationsV2FromEventsTableForPublicApi,
  getObservationsV2PageFromEventsTableForPublicApi,
  getObservationsWithPromptNameFromEvents,
  getSessionMetricsFromEvents,
  getTraceByIdFromEventsTable,
  getTraceMetadataByIdsFromEvents,
  getTracesFromEventsTableForPublicApi,
  getTracesIdentifierForSessionFromEvents,
  hasAnySessionFromEventsTable,
  hasAnyTraceFromEventsTable,
  hasAnyUserFromEventsTable,
  streamObservationIOFieldFromEventsTable,
  getEventsNumericStatsByFilterColumn,
  getObservationsCountFromEventsTable,
  getObservationsCountsFromEventsTable,
  getObservationsForSessionFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getTraceDeleteCursorPageFromEvents,
  getUsersFromEventsTable,
} from "./events";
import { TRACE_AGGREGATION_SQL } from "./events-selects";
import { getEventsStreamForEval } from "./events-stream";
import { getEventsDispatchEventStream } from "./events-dispatch";
import { ALL_SESSION_EVENTS_FIELDS } from "../queries/clickhouse-sql/event-query-builder";
import { buildEventsBlobExportStreamQuery } from "../queries/clickhouse-sql/events-stream-query";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import type { FilterState } from "../../types";
import type { OrderByState } from "../../interfaces/orderBy";
import type { TracingSearchType } from "../../interfaces/search";

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

    it("getObservationsV2FromEventsTableForPublicApi isRootObservation=true", async () => {
      await getObservationsV2FromEventsTableForPublicApi({
        projectId: FIXED_PROJECT_ID,
        page: 1,
        limit: 50,
        fields: ["core"],
        isRootObservation: true,
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

    it("getEventsDispatchEventStream", async () => {
      for await (const _ of getEventsDispatchEventStream({
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

type PublicApiObservationsOpts = Parameters<
  typeof getObservationsV2FromEventsTableForPublicApi
>[0];
type PublicApiObservationsOptions = Parameters<
  typeof getObservationsV2FromEventsTableForPublicApi
>[1];
type PublicApiAdvancedFilters = NonNullable<
  PublicApiObservationsOpts["advancedFilters"]
>;

const V2_BASE_OPTS = {
  projectId: FIXED_PROJECT_ID,
  page: 1,
  limit: 50,
  fields: ["core"],
} satisfies PublicApiObservationsOpts;

/**
 * Captured SQL of one v2 list call, or the error it throws plus whatever it
 * sent before throwing. Rejections snapshot the same way as reads, so a filter
 * that turns from a 400 into SQL shows as a snapshot change.
 */
async function captureV2List(
  opts: Partial<PublicApiObservationsOpts>,
  options?: PublicApiObservationsOptions,
) {
  try {
    await getObservationsV2FromEventsTableForPublicApi(
      { ...V2_BASE_OPTS, ...opts },
      options,
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      error: `${error.constructor.name}: ${error.message}`,
      queries: normalizeCapturedQueries(capturedQueries),
    };
  }
  return normalizeCapturedQueries(capturedQueries);
}

describeWithClickhouse("golden: observations public API filters family", () => {
  beforeEach(() => {
    resetCaptures();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getObservationsV2FromEventsTableForPublicApi simple=all", async () => {
    expect(
      await captureV2List({
        traceId: FIXED_TRACE_ID,
        name: "golden-name",
        userId: "golden-user",
        sessionId: "golden-session",
        level: "ERROR",
        type: "GENERATION",
        version: "golden-version",
        parentObservationId: FIXED_OBSERVATION_ID,
        environment: ["production", "staging"],
        fromStartTime: FIXED_FROM_TIMESTAMP.toISOString(),
        toStartTime: FIXED_TO_TIMESTAMP.toISOString(),
      }),
    ).toMatchSnapshot();
  });

  // `parentObservationId: ""` renders `parent_span_id = ''`, not a null check.
  it("getObservationsV2FromEventsTableForPublicApi simple=parentObservationId empty", async () => {
    expect(await captureV2List({ parentObservationId: "" })).toMatchSnapshot();
  });

  // An empty environment list adds no environment condition.
  it("getObservationsV2FromEventsTableForPublicApi simple=environment empty", async () => {
    expect(await captureV2List({ environment: [] })).toMatchSnapshot();
  });

  // An advanced filter replaces the simple param on the same column.
  it("getObservationsV2FromEventsTableForPublicApi precedence=advanced-overrides-simple", async () => {
    expect(
      await captureV2List({
        sessionId: "golden-session-simple",
        advancedFilters: [
          {
            column: "sessionId",
            type: "string",
            operator: "=",
            value: "golden-session-advanced",
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  // The route's data-access-window shape: advanced `startTime` bounds next to
  // the simple `fromStartTime`/`toStartTime`, which they replace.
  it("getObservationsV2FromEventsTableForPublicApi precedence=startTime-overrides-from+to", async () => {
    expect(
      await captureV2List({
        fromStartTime: FIXED_FROM_TIMESTAMP.toISOString(),
        toStartTime: FIXED_TO_TIMESTAMP.toISOString(),
        advancedFilters: [
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: FIXED_START_TIME,
          },
          {
            column: "startTime",
            type: "datetime",
            operator: "<",
            value: FIXED_TO_TIMESTAMP,
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  it.each([
    [
      "string",
      { column: "name", type: "string", operator: "contains", value: "needle" },
    ],
    [
      "stringOptions",
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION", "SPAN"],
      },
    ],
    // Oddity: the schema refuses an empty list, but a caller that skips it
    // renders `IN ([])`, which matches nothing. The route schema rejects it
    // before the read, so the shape is harmless.
    [
      "stringOptions empty",
      { column: "type", type: "stringOptions", operator: "any of", value: [] },
    ],
    [
      "number",
      { column: "latency", type: "number", operator: ">", value: 1.5 },
    ],
    [
      "datetime",
      {
        column: "endTime",
        type: "datetime",
        operator: "<",
        value: FIXED_TO_TIMESTAMP,
      },
    ],
    [
      "arrayOptions",
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["golden-tag"],
      },
    ],
    [
      "boolean",
      { column: "hasInput", type: "boolean", operator: "=", value: true },
    ],
    [
      "null",
      {
        column: "parentObservationId",
        type: "null",
        operator: "is null",
        value: "",
      },
    ],
    [
      "metadata stringObject = (events_core)",
      {
        column: "metadata",
        type: "stringObject",
        key: "env",
        operator: "=",
        value: "short",
      },
    ],
    [
      "metadata stringObject contains (events_full)",
      {
        column: "metadata",
        type: "stringObject",
        key: "env",
        operator: "contains",
        value: "needle",
      },
    ],
    // Numeric metadata compares the parsed value of the key.
    [
      "metadata numberObject",
      {
        column: "metadata",
        type: "numberObject",
        key: "attempt",
        operator: ">",
        value: 1,
      },
    ],
  ] satisfies Array<[string, PublicApiAdvancedFilters[number]]>)(
    "getObservationsV2FromEventsTableForPublicApi advanced=%s",
    async (_name, filter) => {
      expect(
        await captureV2List({ advancedFilters: [filter] }),
      ).toMatchSnapshot();
    },
  );

  // A `positionInTrace` filter selects by place in the trace, not by a row
  // condition, so the endpoint rejects it before sending a query.
  it("getObservationsV2FromEventsTableForPublicApi advanced=positionInTrace", async () => {
    expect(
      await captureV2List({
        advancedFilters: [
          {
            column: "positionInTrace",
            type: "positionInTrace",
            operator: "=",
            key: "root",
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  // An input filter forces events_full, so the io lane does not split.
  it("getObservationsV2FromEventsTableForPublicApi advanced=input matches fields=io", async () => {
    expect(
      await captureV2List({
        fields: ["core", "io"],
        advancedFilters: [
          {
            column: "input",
            type: "string",
            operator: "matches",
            value: "needle",
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  it("getObservationsV2FromEventsTableForPublicApi fields=io", async () => {
    expect(await captureV2List({ fields: ["core", "io"] })).toMatchSnapshot();
  });

  // A core-safe metadata filter keeps base on events_core: split, filter on base.
  it("getObservationsV2FromEventsTableForPublicApi fields=metadata expand advanced=metadata =", async () => {
    expect(
      await captureV2List({
        fields: ["core", "metadata"],
        expandMetadataKeys: ["golden-key"],
        advancedFilters: [
          {
            column: "metadata",
            type: "stringObject",
            key: "env",
            operator: "=",
            value: "short",
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  // A `contains` metadata filter forces events_full: no split.
  it("getObservationsV2FromEventsTableForPublicApi fields=metadata expand advanced=metadata contains", async () => {
    expect(
      await captureV2List({
        fields: ["core", "metadata"],
        expandMetadataKeys: ["golden-key"],
        advancedFilters: [
          {
            column: "metadata",
            type: "stringObject",
            key: "env",
            operator: "contains",
            value: "needle",
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  it("getObservationsV2FromEventsTableForPublicApi cursor=set", async () => {
    expect(
      await captureV2List({
        cursor: {
          lastStartTimeTo: FIXED_START_TIME,
          lastTraceId: FIXED_TRACE_ID,
          lastId: FIXED_OBSERVATION_ID,
        },
      }),
    ).toMatchSnapshot();
  });

  // MCP `getObservation`: one id inside a trace and time window, limit 1.
  it("getObservationsV2FromEventsTableForPublicApi mcp=getObservation", async () => {
    expect(
      await captureV2List({
        traceId: FIXED_TRACE_ID,
        fromStartTime: FIXED_FROM_TIMESTAMP.toISOString(),
        toStartTime: FIXED_TO_TIMESTAMP.toISOString(),
        page: 0,
        limit: 1,
        fields: ["core", "basic", "io"],
        advancedFilters: [
          {
            column: "id",
            type: "stringOptions",
            operator: "any of",
            value: [FIXED_OBSERVATION_ID],
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  it.each([
    // Not a field of the events predicate source.
    [
      "unknown column",
      { column: "doesNotExist", type: "string", operator: "=", value: "x" },
    ],
    // Score columns have no events lowering. Only the UI planner filters on
    // scores, through its own score CTEs and join.
    [
      "scores_avg",
      {
        column: "scores_avg",
        type: "numberObject",
        key: "accuracy",
        operator: ">",
        value: 0.5,
      },
    ],
    // Input/output filters must be type `string`.
    [
      "input non-string type",
      { column: "input", type: "null", operator: "is not null", value: "" },
    ],
    // `assertIndexedIoFilters`: an IO filter needs a `matches` or
    // `=` IO filter next to it.
    [
      "input contains without matches",
      {
        column: "input",
        type: "string",
        operator: "contains",
        value: "needle",
      },
    ],
  ] satisfies Array<[string, PublicApiAdvancedFilters[number]]>)(
    "getObservationsV2FromEventsTableForPublicApi rejects advanced=%s",
    async (_name, filter) => {
      expect(
        await captureV2List({ advancedFilters: [filter] }),
      ).toMatchSnapshot();
    },
  );

  // `allowUnindexedIoFilters` skips both IO validators.
  it("getObservationsV2FromEventsTableForPublicApi allowUnindexedIoFilters=true advanced=input contains", async () => {
    expect(
      await captureV2List(
        {
          advancedFilters: [
            {
              column: "input",
              type: "string",
              operator: "contains",
              value: "needle",
            },
          ],
        },
        { allowUnindexedIoFilters: true },
      ),
    ).toMatchSnapshot();
  });

  // Ten days: a first window over the last seven (`<=` upper bound), then the
  // remaining three (`<` upper bound).
  it("getObservationsV2PageFromEventsTableForPublicApi from+to=10d", async () => {
    await getObservationsV2PageFromEventsTableForPublicApi({
      ...V2_BASE_OPTS,
      fromStartTime: "2025-12-23T00:00:00.000Z",
      toStartTime: FIXED_TO_TIMESTAMP.toISOString(),
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // No upper bound: the first window has only `>=`.
  it("getObservationsV2PageFromEventsTableForPublicApi from=set to=open", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_TO_TIMESTAMP);
    await getObservationsV2PageFromEventsTableForPublicApi({
      ...V2_BASE_OPTS,
      fromStartTime: "2025-12-30T00:00:00.000Z",
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // Window bounds come from the advanced `startTime` filters and the cursor
  // (`extractObservationsStartTimeBounds`); bounds go on base under the split.
  it("getObservationsV2PageFromEventsTableForPublicApi advanced=startTime cursor=set fields=io", async () => {
    await getObservationsV2PageFromEventsTableForPublicApi({
      ...V2_BASE_OPTS,
      fields: ["core", "io"],
      advancedFilters: [
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: new Date("2025-12-30T00:00:00.000Z"),
        },
        {
          column: "startTime",
          type: "datetime",
          operator: "<=",
          value: FIXED_TO_TIMESTAMP,
        },
      ],
      cursor: {
        lastStartTimeTo: FIXED_START_TIME,
        lastTraceId: FIXED_TRACE_ID,
        lastId: FIXED_OBSERVATION_ID,
      },
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each([
    ["limit=0", { limit: 0 }],
    [
      "from>to",
      {
        fromStartTime: FIXED_TO_TIMESTAMP.toISOString(),
        toStartTime: FIXED_FROM_TIMESTAMP.toISOString(),
      },
    ],
  ] satisfies Array<[string, Partial<PublicApiObservationsOpts>]>)(
    "getObservationsV2PageFromEventsTableForPublicApi %s sends no query",
    async (_name, opts) => {
      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...V2_BASE_OPTS,
        ...opts,
      });
      expect(page).toEqual({ items: [], cursor: undefined });
      expect(capturedQueries).toEqual([]);
    },
  );

  const V1_FILTER_OPTS = {
    projectId: FIXED_PROJECT_ID,
    page: 2,
    limit: 50,
    traceId: FIXED_TRACE_ID,
    type: "GENERATION",
    fromStartTime: FIXED_FROM_TIMESTAMP.toISOString(),
    // v1 skips the IO validators, so a lone `contains` IO filter is accepted.
    advancedFilters: [
      {
        column: "input",
        type: "string",
        operator: "contains",
        value: "needle",
      },
    ],
  } satisfies PublicApiObservationsOpts;

  it("getObservationsFromEventsTableForPublicApi filter=set", async () => {
    await getObservationsFromEventsTableForPublicApi(V1_FILTER_OPTS);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // The count reads `countResult[0].count`, so the harness's empty result
  // throws after the query is sent.
  it("getObservationsCountFromEventsTableForPublicApi filter=set", async () => {
    await expect(
      getObservationsCountFromEventsTableForPublicApi(V1_FILTER_OPTS),
    ).rejects.toThrow(TypeError);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describe("public traces metadata contains reads untruncated values", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it.each(["metadata", "Metadata"])(
    "reads events_full when fields omit io and %s contains can sit past char 200",
    async (column) => {
      await getTracesFromEventsTableForPublicApi({
        projectId: FIXED_PROJECT_ID,
        page: 1,
        limit: 10,
        fields: ["core"],
        advancedFilters: [
          {
            column,
            type: "stringObject",
            operator: "contains",
            key: "experiments",
            value: "item-70",
          },
        ],
      });

      const query = capturedQueries
        .map((captured) => captured.query)
        .join("\n");
      expect(query).toContain("events_full");
      expect(query).not.toContain("events_core");
    },
  );
});

describeWithClickhouse("golden: events trace aggregation family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getTracesFromEventsTableForPublicApi fields=all", async () => {
    await getTracesFromEventsTableForPublicApi({
      projectId: FIXED_PROJECT_ID,
      page: 1,
      limit: 50,
      fields: ["core", "io", "scores", "observations", "metrics"],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getTracesFromEventsTableForPublicApi fields=core fromTimestamp=set", async () => {
    await getTracesFromEventsTableForPublicApi({
      projectId: FIXED_PROJECT_ID,
      page: 1,
      limit: 50,
      fields: ["core"],
      fromTimestamp: FIXED_FROM_TIMESTAMP.toISOString(),
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("raw trace-name aggregation SQL matches the typed trace name", () => {
    // ClickHouse function names are case-insensitive and `clickhouse format`
    // keeps their spelling, so `COALESCE` and `coalesce` compare lowercased.
    const select = (expression: string) =>
      formatSql(`SELECT ${expression} FROM events_core AS e`).toLowerCase();
    expect(select(`${eventsTableTraceNameAggregationSql} AS name`)).toBe(
      select(TRACE_AGGREGATION_SQL.name),
    );
  });

  it("getTracesIdentifierForSessionFromEvents", async () => {
    await getTracesIdentifierForSessionFromEvents(
      FIXED_PROJECT_ID,
      FIXED_SESSION_IDS[0],
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

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

const NATIVE_FILTER: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
];
const OBSERVATION_SCORE_FILTER: FilterState = [
  {
    column: "scores_avg",
    type: "numberObject",
    key: "quality",
    operator: ">",
    value: 0.5,
  },
];
const START_TIME_FROM_FILTER: FilterState = [
  {
    column: "startTime",
    type: "datetime",
    operator: ">=",
    value: FIXED_FROM_TIMESTAMP,
  },
];
// Columns whose legacy mapping is bare (`start_time`, `type`, `environment`),
// quoted (`e."end_time"`) or an expression (cost, latency, trace name), so a
// change in how the column SQL is rendered shows up per kind.
const MAPPED_COLUMNS_FILTER: FilterState = [
  ...START_TIME_FROM_FILTER,
  {
    column: "endTime",
    type: "datetime",
    operator: "<",
    value: FIXED_TO_TIMESTAMP,
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
  { column: "totalCost", type: "number", operator: ">", value: 0.01 },
  { column: "latency", type: "number", operator: ">", value: 1 },
  { column: "traceName", type: "string", operator: "=", value: "golden-name" },
  {
    column: "userId",
    type: "string",
    operator: "contains",
    value: "golden-user",
  },
];
// Filter columns whose rendered SQL no other case pins: an options column
// (level), an expression over the usage/cost maps (cached input), an array
// column (tags), an empty-equals-null column (experimentId) and the ingestion
// attribution columns.
const COLUMN_SQL_FILTER: FilterState = [
  {
    column: "level",
    type: "stringOptions",
    operator: "any of",
    value: ["ERROR"],
  },
  {
    column: "tags",
    type: "arrayOptions",
    operator: "any of",
    value: ["golden-tag"],
  },
  {
    column: "ingestionApiKey",
    type: "stringOptions",
    operator: "any of",
    value: ["pk-lf-golden"],
  },
  {
    column: "ingestionSdkName",
    type: "stringOptions",
    operator: "any of",
    value: ["python"],
  },
  {
    column: "ingestionSdkVersion",
    type: "stringOptions",
    operator: "any of",
    value: ["4.7.1"],
  },
  {
    column: "ingestionSource",
    type: "stringOptions",
    operator: "any of",
    value: ["otel"],
  },
  { column: "experimentId", type: "null", operator: "is null", value: "" },
  { column: "cachedInputTokens", type: "number", operator: "=", value: 0 },
  { column: "cachedInputCost", type: "null", operator: "is null", value: "" },
];

async function captureRowSelection(
  filter: FilterState,
  extra: {
    orderBy?: OrderByState;
    searchQuery?: string;
    searchType?: TracingSearchType[];
  } = {},
) {
  await getObservationsWithModelDataFromEventsTable({
    projectId: FIXED_PROJECT_ID,
    filter,
    limit: 50,
    offset: 0,
    ...extra,
  });
}

// The list/count reads below write no `e.is_deleted = 0`: only the streams add
// it. The cases pin that so a predicate that adds the soft-delete conjunct
// shows as a change.
describeWithClickhouse("golden: events row-selection planner family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("planner filter=none", async () => {
    await captureRowSelection([]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=native", async () => {
    await captureRowSelection(NATIVE_FILTER);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=mappedColumns", async () => {
    await captureRowSelection(MAPPED_COLUMNS_FILTER);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=columnSql", async () => {
    await captureRowSelection(COLUMN_SQL_FILTER);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // A `trace_id =` string filter renders a plain equality and no extra
  // `xxHash32(trace_id) = xxHash32(…)` conjunct: `EventsQueryBuilder.applyFilters`
  // adds that conjunct only for a filter whose field text is `e."trace_id"`,
  // which no filter on this path has.
  it("planner filter=traceId=", async () => {
    await captureRowSelection([
      {
        column: "traceId",
        type: "string",
        operator: "=",
        value: FIXED_TRACE_ID,
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // The `startTime >=` leaf bounds both score CTEs.
  it("planner filter=startTime>=+obsScore", async () => {
    await captureRowSelection([
      ...START_TIME_FROM_FILTER,
      ...OBSERVATION_SCORE_FILTER,
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // With two lower bounds, the later one (`FIXED_START_TIME`) bounds both
  // score CTEs.
  it("planner filter=startTime>+startTime>=+obsScore", async () => {
    await captureRowSelection([
      {
        column: "startTime",
        type: "datetime",
        operator: ">",
        value: FIXED_FROM_TIMESTAMP,
      },
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: FIXED_START_TIME,
      },
      ...OBSERVATION_SCORE_FILTER,
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it.each([
    ["input contains", "input", "string", "contains", "needle"],
    ["metadata contains", "metadata", "stringObject", "contains", "needle"],
    ["metadata =", "metadata", "stringObject", "=", "short"],
  ] as const)(
    "planner filter=%s",
    async (_name, column, type, operator, value) => {
      await captureRowSelection([
        type === "stringObject"
          ? { column, type, key: "env", operator, value }
          : { column, type, operator, value },
      ]);
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("planner filter=metadata numberObject", async () => {
    await captureRowSelection([
      {
        column: "metadata",
        type: "numberObject",
        key: "attempt",
        operator: ">",
        value: 1,
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=obsScore", async () => {
    await captureRowSelection(OBSERVATION_SCORE_FILTER);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // Exclusions over the obs/trace union join with AND, not OR.
  it("planner filter=obsScore categoryOptions none of", async () => {
    await captureRowSelection([
      {
        column: "score_categories",
        type: "categoryOptions",
        key: "sentiment",
        operator: "none of",
        value: ["negative"],
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=obsScore booleanObject <>", async () => {
    await captureRowSelection([
      {
        column: "score_booleans",
        type: "booleanObject",
        key: "correct",
        operator: "<>",
        value: true,
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=traceScore", async () => {
    await captureRowSelection([
      {
        column: "trace_scores_avg",
        type: "numberObject",
        key: "quality",
        operator: ">=",
        value: 1,
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // A trace-score leaf before an observation-score leaf: pins the order of
  // the score conjuncts.
  it("planner filter=traceScore+obsScore", async () => {
    await captureRowSelection([
      {
        column: "trace_scores_avg",
        type: "numberObject",
        key: "quality",
        operator: ">",
        value: 1,
      },
      {
        column: "scores_avg",
        type: "numberObject",
        key: "accuracy",
        operator: ">",
        value: 2,
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // The legacy `scores` column resolves by filter type; categoryOptions maps
  // to `score_categories` (an `any of`, joined with OR).
  it("planner filter=legacy scores categoryOptions", async () => {
    await captureRowSelection([
      {
        column: "scores",
        type: "categoryOptions",
        key: "sentiment",
        operator: "any of",
        value: ["positive"],
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // Ordering by a score needs the complete score source: no name pushdown.
  it.each(["scores_avg", "trace_scores_avg"])(
    "planner orderBy=%s",
    async (column) => {
      await captureRowSelection([], { orderBy: { column, order: "DESC" } });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("planner filter=comments throws before the read", async () => {
    await expect(
      captureRowSelection([
        { column: "commentCount", type: "number", operator: ">", value: 0 },
      ]),
    ).rejects.toThrow(InvalidRequestError);
    expect(capturedQueries).toHaveLength(0);
  });

  it.each([
    ["id", "golden"],
    ["content", "golden"],
    ["content", "naïve"],
  ] as const)("planner search=%s query=%s", async (searchType, searchQuery) => {
    await captureRowSelection([], { searchQuery, searchType: [searchType] });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // The position leaf builds its own `qualifying_obs` CTE from the other
  // leaves and the search; ASC for first, DESC for last.
  it("planner filter=positionInTrace first+native", async () => {
    await captureRowSelection([
      ...NATIVE_FILTER,
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "first",
      },
    ]);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner filter=positionInTrace last search=content", async () => {
    await captureRowSelection(
      [
        {
          column: "positionInTrace",
          type: "positionInTrace",
          operator: "=",
          key: "last",
        },
      ],
      { searchQuery: "golden", searchType: ["content"] },
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // Both count reads index `rows[0]`, so the harness's empty result throws
  // after the query is captured.
  it("planner select=count", async () => {
    await expect(
      getObservationsCountFromEventsTable({
        projectId: FIXED_PROJECT_ID,
        filter: NATIVE_FILTER,
      }),
    ).rejects.toThrow(TypeError);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner select=count-with-unique-traces", async () => {
    await expect(
      getObservationsCountsFromEventsTable({
        projectId: FIXED_PROJECT_ID,
        filter: NATIVE_FILTER,
      }),
    ).rejects.toThrow(TypeError);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner select=trace-delete-cursor cursor=set", async () => {
    await getTraceDeleteCursorPageFromEvents({
      projectId: FIXED_PROJECT_ID,
      filter: NATIVE_FILTER,
      cutoffCreatedAt: FIXED_TO_TIMESTAMP,
      cursor: {
        id: FIXED_OBSERVATION_ID,
        traceId: FIXED_TRACE_ID,
        timestamp: FIXED_START_TIME.toISOString(),
      },
      limit: 100,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner dedupeBySpanId (session observations)", async () => {
    await getObservationsForSessionFromEventsTable({
      projectId: FIXED_PROJECT_ID,
      sessionId: "golden-session",
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("planner cursorPagination cursor=set", async () => {
    await getObservationsWithModelDataFromEventsTable({
      projectId: FIXED_PROJECT_ID,
      filter: NATIVE_FILTER,
      limit: 50,
      cursorPagination: true,
      cursor: {
        lastStartTimeTo: FIXED_START_TIME,
        lastTraceId: FIXED_TRACE_ID,
        lastId: FIXED_OBSERVATION_ID,
      },
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describe("events row-selection planner guards", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("rejects a score filter next to positionInTrace before the read", async () => {
    await expect(
      captureRowSelection([
        ...OBSERVATION_SCORE_FILTER,
        {
          column: "positionInTrace",
          type: "positionInTrace",
          operator: "=",
          key: "first",
        },
      ]),
    ).rejects.toThrow(InvalidRequestError);
    expect(capturedQueries).toHaveLength(0);
  });
});

// Reads that build their own `FilterList` over the events column mapping,
// outside the planner.
describeWithClickhouse("golden: events column-mapping filter family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getEventsNumericStatsByFilterColumn filter=mappedColumns", async () => {
    await getEventsNumericStatsByFilterColumn(
      FIXED_PROJECT_ID,
      MAPPED_COLUMNS_FILTER,
      "latency",
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getUsersFromEventsTable filter=mappedColumns", async () => {
    await getUsersFromEventsTable(FIXED_PROJECT_ID, MAPPED_COLUMNS_FILTER);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describeWithClickhouse("golden: events filtered streams family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  async function drain(rows: AsyncIterable<unknown>) {
    for await (const _ of rows) {
      // The harness streams no rows.
    }
  }

  // The cutoff adds a `startTime <` leaf; streams add `e.is_deleted = 0`.
  it.each([
    ["set", FIXED_TO_TIMESTAMP],
    ["unset", undefined],
  ] as const)("getEventsStreamForEval cutoff=%s", async (_name, cutoff) => {
    await drain(
      await getEventsStreamForEval({
        projectId: FIXED_PROJECT_ID,
        cutoffCreatedAt: cutoff,
        filter: NATIVE_FILTER,
        rowLimit: 100,
      }),
    );
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // The batch export builds the query the worker runs; `startTimeFrom` feeds
  // the worker's distinct-score-names read. Its scores join is written
  // `scores_agg s ON s.trace_id = … AND s.observation_id = …`, unlike the
  // planner's `scores_agg AS s` (#15591); kept byte-equal.
  function renderBlobExportStream(
    input: Partial<Parameters<typeof buildEventsBlobExportStreamQuery>[0]>,
  ) {
    const { queryBuilder, startTimeFrom } = buildEventsBlobExportStreamQuery({
      projectId: FIXED_PROJECT_ID,
      cutoffCreatedAt: FIXED_TO_TIMESTAMP,
      filter: [],
      rowLimit: 100,
      ...input,
    });
    const { query, params } = queryBuilder.buildWithParams();
    return {
      queries: normalizeCapturedQueries([
        { fn: "buildEventsBlobExportStreamQuery", query, params },
      ]),
      startTimeFrom,
    };
  }

  // The export always reads the complete score source, so no score filter
  // pushes `name IN (…)` into the CTEs; score leaves only change the WHERE.
  // Exclusions (`none of`, `<>`) over the obs/trace union join with AND,
  // inclusions with OR.
  it.each<
    [
      string,
      FilterState,
      { searchQuery?: string; searchType?: TracingSearchType[] },
    ]
  >([
    ["none", [], {}],
    ["native", NATIVE_FILTER, {}],
    ["obsScore", OBSERVATION_SCORE_FILTER, {}],
    [
      "obsScore categoryOptions none of",
      [
        {
          column: "score_categories",
          type: "categoryOptions",
          key: "sentiment",
          operator: "none of",
          value: ["negative"],
        },
      ],
      {},
    ],
    [
      "obsScore categoryOptions any of",
      [
        {
          column: "score_categories",
          type: "categoryOptions",
          key: "sentiment",
          operator: "any of",
          value: ["positive"],
        },
      ],
      {},
    ],
    [
      "obsScore booleanObject <>",
      [
        {
          column: "score_booleans",
          type: "booleanObject",
          key: "correct",
          operator: "<>",
          value: true,
        },
      ],
      {},
    ],
    [
      "obsScore booleanObject =",
      [
        {
          column: "score_booleans",
          type: "booleanObject",
          key: "correct",
          operator: "=",
          value: true,
        },
      ],
      {},
    ],
    [
      "traceScore",
      [
        {
          column: "trace_scores_avg",
          type: "numberObject",
          key: "quality",
          operator: ">=",
          value: 1,
        },
      ],
      {},
    ],
    // A trace-score leaf before an observation-score leaf: pins the order of
    // the score conjuncts.
    [
      "traceScore+obsScore",
      [
        {
          column: "trace_scores_avg",
          type: "numberObject",
          key: "quality",
          operator: ">",
          value: 1,
        },
        {
          column: "scores_avg",
          type: "numberObject",
          key: "accuracy",
          operator: ">",
          value: 2,
        },
      ],
      {},
    ],
    ["startTime>=", START_TIME_FROM_FILTER, {}],
    ["search", [], { searchQuery: "golden", searchType: ["id", "content"] }],
  ])(
    "buildEventsBlobExportStreamQuery filter=%s",
    async (_name, filter, search) => {
      expect(renderBlobExportStream({ filter, ...search })).toMatchSnapshot();
    },
  );

  // `cutoffCreatedAt` is optional on the exported input: unset drops the
  // `startTime <` leaf. The worker always sets it.
  it("buildEventsBlobExportStreamQuery cutoff=unset", async () => {
    expect(
      renderBlobExportStream({
        cutoffCreatedAt: undefined,
        filter: NATIVE_FILTER,
      }),
    ).toMatchSnapshot();
  });

  describe("scores dedup skipped", () => {
    const originalSkipIds = env.LANGFUSE_SKIP_SCORES_DEDUP_PROJECT_IDS;
    beforeAll(() => {
      env.LANGFUSE_SKIP_SCORES_DEDUP_PROJECT_IDS = new Set([FIXED_PROJECT_ID]);
    });
    afterAll(() => {
      env.LANGFUSE_SKIP_SCORES_DEDUP_PROJECT_IDS = originalSkipIds;
    });

    // A project listed in LANGFUSE_SKIP_SCORES_DEDUP_PROJECT_IDS reads both
    // score CTEs without FINAL.
    it("buildEventsBlobExportStreamQuery scoresDedup=skip", async () => {
      expect(renderBlobExportStream({})).toMatchSnapshot();
    });
  });
});

describeWithClickhouse("golden: events AI gateway family", () => {
  beforeEach(() => resetCaptures());

  // The subject column is the only SQL branch: the key id, the key owner's
  // metadata entry, or the ingestion project.
  it.each(["API_KEY", "USER", "ORGANIZATION"] as const)(
    "getGatewaySpendSinceFromEvents scope=%s",
    async (scope) => {
      await getGatewaySpendSinceFromEvents({
        projectId: FIXED_PROJECT_ID,
        scope,
        subjects: [
          { id: "golden-subject", since: FIXED_FROM_TIMESTAMP },
          { id: "golden-subject-b", since: FIXED_START_TIME },
        ],
      });
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );

  it("getGatewayApiKeysLastUsedAtFromEvents", async () => {
    await getGatewayApiKeysLastUsedAtFromEvents({
      projectId: FIXED_PROJECT_ID,
      apiKeyIds: ["golden-key", "golden-key-b"],
      since: FIXED_FROM_TIMESTAMP,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
