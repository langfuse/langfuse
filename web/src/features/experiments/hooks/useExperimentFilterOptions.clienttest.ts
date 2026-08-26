import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExperimentFilterOptions } from "./useExperimentFilterOptions";

const apiMocks = vi.hoisted(() => ({
  allDatasetMetaQuery: vi.fn(),
  filterOptionsQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: { useQuery: apiMocks.allDatasetMetaQuery },
    },
    experiments: {
      filterOptions: { useQuery: apiMocks.filterOptionsQuery },
    },
  },
}));

describe("useExperimentFilterOptions", () => {
  beforeEach(() => {
    apiMocks.allDatasetMetaQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    apiMocks.filterOptionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch filter options before the route projectId hydrates", () => {
    renderHook(() =>
      useExperimentFilterOptions({
        projectId: "",
        oldFilterState: [],
      }),
    );

    expect(apiMocks.allDatasetMetaQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
    expect(apiMocks.filterOptionsQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches filter options once a projectId is available", () => {
    renderHook(() =>
      useExperimentFilterOptions({
        projectId: "project-1",
        oldFilterState: [],
      }),
    );

    expect(apiMocks.allDatasetMetaQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(apiMocks.filterOptionsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
