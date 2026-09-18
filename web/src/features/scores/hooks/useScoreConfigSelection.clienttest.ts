import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { useScoreConfigSelection } from "./useScoreConfigSelection";

const { setEmptySelectedConfigIds } = vi.hoisted(() => ({
  setEmptySelectedConfigIds: vi.fn(),
}));

vi.mock("./useEmptyConfigs", () => ({
  useEmptyScoreConfigs: () => ({
    emptySelectedConfigIds: ["empty-a", "empty-b", "archived"],
    setEmptySelectedConfigIds,
  }),
}));

describe("score field selection", () => {
  it("clears all empty fields while retaining saved and archived fields", () => {
    const ids = ["empty-a", "saved", "empty-b", "archived"];
    const configs = ids.map((id) => ({
      id,
      name: id,
      projectId: "project",
      createdAt: new Date(),
      updatedAt: new Date(),
      dataType: "NUMERIC" as const,
      isArchived: id === "archived",
    })) satisfies ScoreConfigDomain[];
    const remove = vi.fn();
    const { result } = renderHook(() =>
      useScoreConfigSelection({
        configs,
        controlledFields: ids.map((id) => ({
          configId: id,
          name: id,
          dataType: "NUMERIC",
          id: id === "saved" ? "score" : null,
        })),
        isInputDisabled: (config) => config.isArchived,
        insert: vi.fn(),
        remove,
      }),
    );

    result.current.handleSelectionChange([]);

    expect(remove).toHaveBeenCalledExactlyOnceWith([0, 2]);
    expect(setEmptySelectedConfigIds).toHaveBeenCalledExactlyOnceWith([
      "archived",
    ]);
  });
});
