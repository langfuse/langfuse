import { renderHook } from "@testing-library/react";

import { APP_ROOT_OBSERVATION_FILTER } from "@/src/features/events/lib/appRootDefaultPolicy";
import { useEventsTableData } from "./useEventsTableData";

const fallbackError = new Error("fallback failed");

vi.mock("@/src/utils/api", () => ({
  sendAsPostOption: {},
  api: {
    events: {
      all: {
        useQuery: (input: { filter: Array<{ column: string }> }) => {
          const isRootQuery = input.filter.some(
            (filter) => filter.column === "isRootObservation",
          );

          return isRootQuery
            ? {
                data: { observations: [], hasMore: false },
                dataUpdatedAt: 1,
                error: null,
                isError: false,
                isLoading: false,
                isPlaceholderData: false,
                isSuccess: true,
              }
            : {
                data: undefined,
                dataUpdatedAt: 2,
                error: fallbackError,
                isError: true,
                isLoading: false,
                isPlaceholderData: false,
                isSuccess: false,
              };
        },
      },
      batchIO: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      countAll: {
        useQuery: () => ({
          data: undefined,
          isError: false,
          isFetching: false,
        }),
      },
    },
    annotationQueueItems: {
      createMany: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

describe("useEventsTableData app-root fallback", () => {
  it("keeps the successful root result when the fallback query fails", () => {
    const { result } = renderHook(() =>
      useEventsTableData({
        projectId: "project-a",
        filterState: [APP_ROOT_OBSERVATION_FILTER],
        paginationState: { page: 1, limit: 50 },
        orderByState: null,
        selectedRows: {},
        selectAll: false,
        setSelectedRows: vi.fn(),
        appRootFallbackEnabled: true,
      }),
    );

    expect(result.current.observations).toEqual({
      status: "success",
      rows: [],
    });
    expect(result.current.error).toBeNull();
    expect(result.current.usedAppRootFallback).toBe(false);
  });
});
