import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../repositories/goldenHarness";

vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } =
    await import("../repositories/goldenHarness.js");
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

describeWithClickhouse("golden: sessions simple aggregates family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getSessionTracesFromEvents", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
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
