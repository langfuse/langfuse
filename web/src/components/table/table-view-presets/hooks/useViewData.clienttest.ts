import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useViewData } from "./useViewData";

const EXPERIMENTS_TABLE = "experiments" as Parameters<
  typeof useViewData
>[0]["tableName"];

const apiMocks = vi.hoisted(() => ({
  getByTableNameQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    TableViewPresets: {
      getByTableName: { useQuery: apiMocks.getByTableNameQuery },
    },
  },
}));

describe("useViewData", () => {
  beforeEach(() => {
    apiMocks.getByTableNameQuery.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch saved views before the route projectId hydrates", () => {
    renderHook(() =>
      useViewData({
        tableName: EXPERIMENTS_TABLE,
        projectId: "",
      }),
    );

    expect(apiMocks.getByTableNameQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches saved views once a projectId is available", () => {
    renderHook(() =>
      useViewData({
        tableName: EXPERIMENTS_TABLE,
        projectId: "project-1",
      }),
    );

    expect(apiMocks.getByTableNameQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: EXPERIMENTS_TABLE,
        projectId: "project-1",
      }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
