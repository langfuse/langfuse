import { describe, expect, it, vi } from "vitest";
import { createObservationsTableStore } from "@/src/features/tracing-tables/observations/observationsTableStore";

function createTestStore({ initialSelectAll = false } = {}) {
  const onSelectAllChange = vi.fn();
  const store = createObservationsTableStore({
    initialSelectAll,
    onSelectAllChange,
  });
  return { store, onSelectAllChange };
}

describe("createObservationsTableStore", () => {
  it("toggles a row on and recomputes selected page rows", () => {
    const { store } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 2,
    });

    store.getState().actions.toggleRow("a", true);

    expect(store.getState().rowSelection).toEqual({ a: true });
    expect(store.getState().selectedPageRowIds).toEqual(["a"]);
  });

  it("toggling a row off drops selectAll and notifies the bridge", () => {
    const { store, onSelectAllChange } = createTestStore({
      initialSelectAll: true,
    });
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 2,
    });
    store.getState().actions.toggleRow("a", true);
    onSelectAllChange.mockClear();

    store.getState().actions.toggleRow("a", false);

    expect(store.getState().rowSelection).toEqual({});
    expect(store.getState().selectAll).toBe(false);
    expect(onSelectAllChange).toHaveBeenCalledWith(false);
  });

  it("toggleRows selects a range without touching other rows", () => {
    const { store } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b", "c", "d"],
      totalCount: 4,
    });
    store.getState().actions.toggleRow("a", true);

    store.getState().actions.toggleRows(["b", "c"], true);

    expect(store.getState().rowSelection).toEqual({
      a: true,
      b: true,
      c: true,
    });
    expect(store.getState().selectedPageRowIds).toEqual(["a", "b", "c"]);
  });

  it("toggleRows deselect drops selectAll and notifies the bridge", () => {
    const { store, onSelectAllChange } = createTestStore({
      initialSelectAll: true,
    });
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b", "c"],
      totalCount: 3,
    });
    store.getState().actions.toggleRows(["a", "b", "c"], true);
    onSelectAllChange.mockClear();

    store.getState().actions.toggleRows(["b", "c"], false);

    expect(store.getState().rowSelection).toEqual({ a: true });
    expect(store.getState().selectAll).toBe(false);
    expect(onSelectAllChange).toHaveBeenCalledWith(false);
  });

  it("togglePageRows selects all page rows and preserves other-page selection", () => {
    const { store } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 4,
    });
    store.getState().actions.toggleRow("other-page-row", true);

    store.getState().actions.togglePageRows(["a", "b"], true);

    expect(store.getState().rowSelection).toEqual({
      "other-page-row": true,
      a: true,
      b: true,
    });
    expect(store.getState().selectedPageRowIds).toEqual(["a", "b"]);
  });

  it("togglePageRows off clears the entire selection", () => {
    const { store, onSelectAllChange } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a"],
      totalCount: 1,
    });
    store.getState().actions.toggleRow("a", true);
    store.getState().actions.toggleRow("other-page-row", true);
    onSelectAllChange.mockClear();

    store.getState().actions.togglePageRows(["a"], false);

    expect(store.getState().rowSelection).toEqual({});
    expect(store.getState().selectedPageRowIds).toEqual([]);
    expect(store.getState().selectAll).toBe(false);
    expect(onSelectAllChange).toHaveBeenCalledWith(false);
  });

  it("setRowSelection resolves functional updaters", () => {
    const { store } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 2,
    });
    store.getState().actions.setRowSelection({ a: true });

    store.getState().actions.setRowSelection((previous) => ({
      ...previous,
      b: true,
    }));

    expect(store.getState().rowSelection).toEqual({ a: true, b: true });
    expect(store.getState().selectedPageRowIds).toEqual(["a", "b"]);
  });

  it("setSelectAll notifies the bridge only on actual changes", () => {
    const { store, onSelectAllChange } = createTestStore();

    store.getState().actions.setSelectAll(true);
    store.getState().actions.setSelectAll(true);

    expect(store.getState().selectAll).toBe(true);
    expect(onSelectAllChange).toHaveBeenCalledTimes(1);
    expect(onSelectAllChange).toHaveBeenCalledWith(true);
  });

  it("syncSelectAll updates state without echoing to the bridge", () => {
    const { store, onSelectAllChange } = createTestStore();

    store.getState().actions.syncSelectAll(true);

    expect(store.getState().selectAll).toBe(true);
    expect(onSelectAllChange).not.toHaveBeenCalled();
  });

  it("syncPageRows recomputes selected page rows for the new page", () => {
    const { store } = createTestStore();
    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 4,
    });
    store.getState().actions.toggleRow("a", true);

    store.getState().actions.syncPageRows({
      pageRowIds: ["c", "d"],
      totalCount: 4,
    });
    expect(store.getState().selectedPageRowIds).toEqual([]);

    store.getState().actions.syncPageRows({
      pageRowIds: ["a", "b"],
      totalCount: 4,
    });
    expect(store.getState().selectedPageRowIds).toEqual(["a"]);
  });

  it("clearSelection resets selection and selectAll", () => {
    const { store, onSelectAllChange } = createTestStore({
      initialSelectAll: true,
    });
    store.getState().actions.syncPageRows({
      pageRowIds: ["a"],
      totalCount: 1,
    });
    store.getState().actions.toggleRow("a", true);
    onSelectAllChange.mockClear();

    store.getState().actions.clearSelection();

    expect(store.getState().rowSelection).toEqual({});
    expect(store.getState().selectedPageRowIds).toEqual([]);
    expect(store.getState().selectAll).toBe(false);
    expect(onSelectAllChange).toHaveBeenCalledWith(false);
  });
});
