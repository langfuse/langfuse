import { describe, expect, it } from "vitest";
import { createDatasetsTableStore } from "@/src/features/datasets/components/datasetsTableStore";

describe("createDatasetsTableStore", () => {
  it("toggles a dataset row and tracks selected rows on the current page", () => {
    const store = createDatasetsTableStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["dataset-a", "dataset-b"],
      totalCount: 2,
    });

    store.getState().actions.toggleRow("dataset-a", true);

    expect(store.getState().rowSelection).toEqual({ "dataset-a": true });
    expect(store.getState().selectedPageRowIds).toEqual(["dataset-a"]);
  });

  it("selects all page dataset rows while preserving other page selections", () => {
    const store = createDatasetsTableStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["dataset-a", "dataset-b"],
      totalCount: 3,
    });
    store.getState().actions.toggleRow("other-page-dataset", true);

    store.getState().actions.togglePageRows(["dataset-a", "dataset-b"], true);

    expect(store.getState().rowSelection).toEqual({
      "other-page-dataset": true,
      "dataset-a": true,
      "dataset-b": true,
    });
    expect(store.getState().selectedPageRowIds).toEqual([
      "dataset-a",
      "dataset-b",
    ]);
  });

  it("syncs selected page rows when pagination changes", () => {
    const store = createDatasetsTableStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["dataset-a"],
      totalCount: 2,
    });
    store.getState().actions.toggleRow("dataset-a", true);

    store.getState().actions.syncPageRows({
      pageRowIds: ["dataset-b"],
      totalCount: 2,
    });

    expect(store.getState().selectedPageRowIds).toEqual([]);
    expect(store.getState().rowSelection).toEqual({ "dataset-a": true });
  });

  it("clears selection", () => {
    const store = createDatasetsTableStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["dataset-a"],
      totalCount: 1,
    });
    store.getState().actions.toggleRow("dataset-a", true);

    store.getState().actions.clearSelection();

    expect(store.getState().rowSelection).toEqual({});
    expect(store.getState().selectedPageRowIds).toEqual([]);
    expect(store.getState().selectAll).toBe(false);
  });
});
