// Golden SQL for the events-backed sessions table aggregates.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilterState } from "../../types";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../repositories/__tests__/goldenHarness";

vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } =
    await import("../repositories/__tests__/goldenHarness.js");
  return buildClickhouseMock(actual);
});

// Enter through the server barrel: importing the service directly hits the
// db -> server-barrel -> events import cycle before events.ts initializes.
import {
  ALL_SESSION_EVENTS_FIELDS,
  getSessionTracesFromEvents,
  getSessionsTableCountFromEvents,
  getSessionsTableFromEvents,
} from "../index";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

const traceNameFilter: FilterState[number] = {
  type: "string",
  column: "traceName",
  operator: "=",
  value: "golden-trace-name",
};

const observationFilters: FilterState = [
  {
    type: "string",
    column: "name",
    operator: "contains",
    value: "golden-observation",
  },
  {
    type: "stringOptions",
    column: "level",
    operator: "any of",
    value: ["ERROR", "WARNING"],
  },
];

describeWithClickhouse("golden: sessions simple aggregates family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getSessionTracesFromEvents", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: [],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionTracesFromEvents filter=none traceIds limit", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: [],
      traceIds: ["golden-trace", "golden-trace-b"],
      limit: 10,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionTracesFromEvents filter=traceName", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: [traceNameFilter],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  // Splices a second compile of the trace query into the legacy observation
  // query; both compiles bind under the same default param names.
  it("getSessionTracesFromEvents filter=observation", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: observationFilters,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionTracesFromEvents filter=traceName+observation", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: [traceNameFilter, ...observationFilters],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionTracesFromEvents filter=observation traceIds limit", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
      filter: observationFilters,
      traceIds: ["golden-trace", "golden-trace-b"],
      limit: 10,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describeWithClickhouse("golden: sessions table aggregation family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getSessionsTableFromEvents filter=none", async () => {
    await getSessionsTableFromEvents({
      projectId: "golden-project",
      filter: [],
      fields: ALL_SESSION_EVENTS_FIELDS,
      limit: 50,
      page: 0,
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });

  it("getSessionsTableCountFromEvents filter=metadata+tools+sessionIds+createdAt", async () => {
    await getSessionsTableCountFromEvents({
      projectId: "golden-project",
      filter: [
        {
          type: "stringObject",
          column: "metadata",
          key: "golden-key",
          operator: "contains",
          value: "golden-value",
        },
        {
          type: "arrayOptions",
          column: "toolNames",
          operator: "any of",
          value: ["golden-tool"],
        },
        {
          type: "stringOptions",
          column: "id",
          operator: "any of",
          value: ["golden-session", "golden-session-b"],
        },
        {
          type: "datetime",
          column: "createdAt",
          operator: ">=",
          value: new Date("2025-12-01T00:00:00.000Z"),
        },
      ],
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
