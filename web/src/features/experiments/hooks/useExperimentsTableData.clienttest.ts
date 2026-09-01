import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExperimentsTableData } from "./useExperimentsTableData";

const mocks = vi.hoisted(() => ({
  allUseQuery: vi.fn(),
  metricsUseQuery: vi.fn(),
  countAllUseQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    experiments: {
      all: {
        useQuery: (...args: unknown[]) => mocks.allUseQuery(...args),
      },
      metrics: {
        useQuery: (...args: unknown[]) => mocks.metricsUseQuery(...args),
      },
      countAll: {
        useQuery: (...args: unknown[]) => mocks.countAllUseQuery(...args),
      },
    },
  },
}));

const loadingQuery = {
  isLoading: true,
  isError: false,
  isSuccess: false,
  data: undefined,
  dataUpdatedAt: 0,
};

describe("useExperimentsTableData", () => {
  beforeEach(() => {
    mocks.allUseQuery.mockReset().mockReturnValue(loadingQuery);
    mocks.metricsUseQuery.mockReset().mockReturnValue(loadingQuery);
    mocks.countAllUseQuery.mockReset().mockReturnValue(loadingQuery);
  });

  it("does not fetch experiments.all or countAll before projectId is hydrated", () => {
    renderHook(() =>
      useExperimentsTableData({
        projectId: "",
        filterState: [],
        paginationState: { page: 1, limit: 50 },
        orderByState: null,
      }),
    );

    expect(mocks.allUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "" }),
      expect.objectContaining({ enabled: false }),
    );
    expect(mocks.countAllUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "" }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches once projectId is a real string", () => {
    renderHook(() =>
      useExperimentsTableData({
        projectId: "project-1",
        filterState: [],
        paginationState: { page: 1, limit: 50 },
        orderByState: null,
      }),
    );

    expect(mocks.allUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.countAllUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
