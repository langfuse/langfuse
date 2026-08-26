import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExperimentFilterOptions } from "./useExperimentFilterOptions";

const mocks = vi.hoisted(() => ({
  allDatasetMetaUseQuery: vi.fn(),
  filterOptionsUseQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: {
        useQuery: (...args: unknown[]) => mocks.allDatasetMetaUseQuery(...args),
      },
    },
    experiments: {
      filterOptions: {
        useQuery: (...args: unknown[]) => mocks.filterOptionsUseQuery(...args),
      },
    },
  },
}));

const loadingQuery = { data: undefined, isLoading: true };

describe("useExperimentFilterOptions", () => {
  beforeEach(() => {
    mocks.allDatasetMetaUseQuery.mockReset().mockReturnValue(loadingQuery);
    mocks.filterOptionsUseQuery.mockReset().mockReturnValue(loadingQuery);
  });

  it("does not fetch dataset meta or filter options before projectId is hydrated", () => {
    renderHook(() =>
      useExperimentFilterOptions({
        projectId: "",
        oldFilterState: [],
      }),
    );

    expect(mocks.allDatasetMetaUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "" }),
      expect.objectContaining({ enabled: false }),
    );
    expect(mocks.filterOptionsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "" }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches once projectId is a real string", () => {
    renderHook(() =>
      useExperimentFilterOptions({
        projectId: "project-1",
        oldFilterState: [],
      }),
    );

    expect(mocks.allDatasetMetaUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.filterOptionsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
