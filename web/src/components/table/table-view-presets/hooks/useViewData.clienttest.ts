import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useViewData } from "./useViewData";

const tracesTable = "traces" as const;

const mocks = vi.hoisted(() => ({
  getByTableNameUseQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    TableViewPresets: {
      getByTableName: {
        useQuery: (...args: unknown[]) => mocks.getByTableNameUseQuery(...args),
      },
    },
  },
}));

describe("useViewData", () => {
  beforeEach(() => {
    mocks.getByTableNameUseQuery.mockReset().mockReturnValue({ data: [] });
  });

  it("does not fetch saved views before projectId is hydrated", () => {
    renderHook(() =>
      useViewData({
        tableName: tracesTable as "traces",
        projectId: "",
      }),
    );

    expect(mocks.getByTableNameUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "", tableName: "traces" }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches once projectId is a real string", () => {
    renderHook(() =>
      useViewData({
        tableName: tracesTable as "traces",
        projectId: "project-1",
      }),
    );

    expect(mocks.getByTableNameUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", tableName: "traces" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
