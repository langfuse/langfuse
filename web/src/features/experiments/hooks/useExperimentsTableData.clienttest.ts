import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExperimentsTableData } from "./useExperimentsTableData";

const apiMocks = vi.hoisted(() => ({
  allQuery: vi.fn(),
  countAllQuery: vi.fn(),
  metricsQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    experiments: {
      all: { useQuery: apiMocks.allQuery },
      countAll: { useQuery: apiMocks.countAllQuery },
      metrics: { useQuery: apiMocks.metricsQuery },
    },
  },
}));

const emptyTableParams = {
  filterState: [],
  paginationState: { page: 1, limit: 50 },
  orderByState: null,
};

describe("useExperimentsTableData", () => {
  beforeEach(() => {
    apiMocks.allQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
      dataUpdatedAt: 0,
    });
    apiMocks.countAllQuery.mockReturnValue({ data: undefined });
    apiMocks.metricsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch experiments before the route projectId hydrates", () => {
    renderHook(() =>
      useExperimentsTableData({
        projectId: "",
        ...emptyTableParams,
      }),
    );

    expect(apiMocks.allQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
    expect(apiMocks.countAllQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches experiments once a projectId is available", () => {
    renderHook(() =>
      useExperimentsTableData({
        projectId: "project-1",
        ...emptyTableParams,
      }),
    );

    expect(apiMocks.allQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(apiMocks.countAllQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
