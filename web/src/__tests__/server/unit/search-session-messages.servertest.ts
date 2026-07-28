import { vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";

const getObservationsWithModelDataFromEventsTable = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getObservationsWithModelDataFromEventsTable,
}));

import { searchSessionMessages } from "@/src/features/sessions/server/searchSessionMessages";

describe("searchSessionMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs one bounded full-I/O search in the requested session and filters", async () => {
    const startTime = new Date("2026-07-28T08:00:00Z");
    getObservationsWithModelDataFromEventsTable.mockResolvedValue([
      {
        id: "observation-1",
        traceId: "trace-1",
        name: "generation",
        traceName: "checkout",
        startTime,
      },
      {
        id: "observation-2",
        traceId: "trace-2",
        name: null,
        traceName: null,
        startTime,
      },
    ]);
    const timeFilter = {
      column: "startTime",
      type: "datetime" as const,
      operator: ">=" as const,
      value: startTime,
    };

    const result = await searchSessionMessages({
      projectId: "project-1",
      sessionId: "session-1",
      query: "needle",
      filter: [timeFilter],
      limit: 1,
      offset: 50,
    });

    expect(getObservationsWithModelDataFromEventsTable).toHaveBeenCalledOnce();
    expect(getObservationsWithModelDataFromEventsTable).toHaveBeenCalledWith({
      projectId: "project-1",
      filter: [
        timeFilter,
        {
          column: "sessionId",
          type: "string",
          operator: "=",
          value: "session-1",
        },
      ],
      searchQuery: "needle",
      searchType: ["content"],
      orderBy: { column: "startTime", order: "ASC" },
      limit: 2,
      offset: 50,
      selectIOAndMetadata: false,
      dedupeBySpanId: true,
    });
    expect(result).toEqual({
      results: [
        {
          traceId: "trace-1",
          observationId: "observation-1",
          observationName: "generation",
          traceName: "checkout",
          startTime,
        },
      ],
      hasMore: true,
    });
  });
});
