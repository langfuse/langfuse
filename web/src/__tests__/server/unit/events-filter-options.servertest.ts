import type * as EventsServiceModule from "@/src/features/events/server/eventsService";

const mocks = vi.hoisted(() => ({
  getEventFilterOptions: vi.fn(async () => ({})),
}));

vi.mock(
  "@/src/features/events/server/eventsService",
  async (importOriginal) => {
    const actual = await importOriginal<typeof EventsServiceModule>();

    return {
      ...actual,
      getEventFilterOptions: mocks.getEventFilterOptions,
    };
  },
);

import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventsRouter } from "@/src/features/events/server/eventsRouter";
import { partitionEventFilterOptionsFilter } from "@/src/features/events/server/eventsService";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { FilterState } from "@langfuse/shared";

const projectId = "project-id";
const session = {
  expires: "1",
  user: {
    id: "user-id",
    organizations: [
      {
        id: "org-id",
        role: "OWNER",
        projects: [{ id: projectId, role: "ADMIN" }],
      },
    ],
  },
} as Session;

describe("events.filterOptions applied-filter contract", () => {
  beforeEach(() => {
    mocks.getEventFilterOptions.mockClear();
  });

  it("accepts and forwards an optional applied filter", async () => {
    const filter: FilterState = [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["checkout"],
      },
    ];

    const caller = eventsRouter.createCaller(
      createInnerTRPCContext({ session, headers: {} }),
    );
    await caller.filterOptions({
      projectId,
      filter,
      columns: ["name"],
    });

    expect(mocks.getEventFilterOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        filter,
        columns: ["name"],
      }),
    );
  });

  it("keeps supported filters and excludes expensive special cases", () => {
    const participatingFilter: FilterState = [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["checkout"],
      },
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "eu",
      },
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: ">",
        value: 0.5,
      },
      {
        type: "numberObject",
        column: "trace_scores_avg",
        key: "quality",
        operator: ">",
        value: 0.5,
      },
    ];
    const nonParticipatingFilters: FilterState = [
      {
        type: "string",
        column: "input",
        operator: "contains",
        value: "needle",
      },
      {
        type: "string",
        column: "output",
        operator: "contains",
        value: "needle",
      },
      {
        type: "positionInTrace",
        column: "positionInTrace",
        operator: "=",
        key: "nthFromStart",
        value: 1,
      },
      {
        type: "number",
        column: "commentCount",
        operator: ">",
        value: 0,
      },
      {
        type: "string",
        column: "commentContent",
        operator: "contains",
        value: "needle",
      },
    ];

    expect(partitionEventFilterOptionsFilter(participatingFilter)).toEqual({
      participatingFilter,
      omitCounts: false,
    });
    nonParticipatingFilters.forEach((filterItem) => {
      expect(partitionEventFilterOptionsFilter([filterItem])).toEqual({
        participatingFilter: [],
        omitCounts: true,
      });
    });
  });

  it("leaves start-time scoping to the existing startTimeFilter input", () => {
    const startTimeFilter: FilterState = [
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];

    expect(partitionEventFilterOptionsFilter(startTimeFilter)).toEqual({
      participatingFilter: [],
      omitCounts: false,
    });
  });
});
