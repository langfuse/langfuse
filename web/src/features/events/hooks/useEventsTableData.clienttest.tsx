import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEventsTableData } from "@/src/features/events/hooks/useEventsTableData";

const { mockCreateMany } = vi.hoisted(() => ({
  mockCreateMany: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      all: {
        useQuery: () => ({
          data: {
            observations: [
              {
                id: "observation-1",
                traceId: "trace-1",
                startTime: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
            hasMore: false,
          },
          dataUpdatedAt: 0,
          error: null,
          isError: false,
          isLoading: false,
          isPlaceholderData: false,
          isSuccess: true,
        }),
      },
      batchIO: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      countAll: {
        useQuery: () => ({
          data: { totalCount: 1, uniqueTraceCount: 1 },
          isError: false,
          isFetching: false,
        }),
      },
    },
    annotationQueueItems: {
      createMany: {
        useMutation: () => ({ mutateAsync: mockCreateMany }),
      },
    },
  },
  sendAsPostOption: {},
}));

describe("useEventsTableData", () => {
  it("persists the complete Events query for select-all annotation actions", async () => {
    const filterState = [
      {
        type: "string" as const,
        column: "name",
        operator: "contains" as const,
        value: "checkout",
      },
    ];
    const orderByState = { column: "endTime", order: "ASC" as const };
    const searchType = ["id", "content"] as const;

    const { result } = renderHook(() =>
      useEventsTableData({
        projectId: "project-1",
        filterState,
        paginationState: { page: 0, limit: 50 },
        orderByState,
        searchQuery: "refund",
        searchType: [...searchType],
        selectedRows: { "observation-1": true },
        selectAll: true,
        setSelectedRows: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddToAnnotationQueue({
        projectId: "project-1",
        targetId: "queue-1",
      });
    });

    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        isBatchAction: true,
        query: {
          filter: filterState,
          orderBy: orderByState,
          searchQuery: "refund",
          searchType,
        },
      }),
    );
  });
});
