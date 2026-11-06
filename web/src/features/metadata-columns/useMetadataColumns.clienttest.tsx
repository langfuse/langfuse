import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMetadataColumns } from "./useMetadataColumns";
import { type MetadataColumnConfig } from "./metadata-columns";

const keyFor = (project: string) =>
  `metadataColumns:observations-events:${project}`;
const repo: MetadataColumnConfig = {
  key: "repo",
  label: "Repository",
  position: 2,
  visible: true,
};

describe("useMetadataColumns local preferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });

  it("persists edits and keeps separate instances in the same tab synchronized", () => {
    const first = renderHook(() => useMetadataColumns("sync", true));
    const second = renderHook(() => useMetadataColumns("sync", true));
    act(() => {
      first.result.current.setMetadataColumns([repo]);
      first.result.current.setMetadataColumns((previous) =>
        previous.map((config) => ({ ...config, visible: false })),
      );
    });
    expect(second.result.current.metadataColumns).toEqual([
      { ...repo, visible: false },
    ]);
    expect(JSON.parse(localStorage.getItem(keyFor("sync"))!)).toEqual([
      { ...repo, visible: false },
    ]);
    first.unmount();
    second.unmount();
    const reloaded = renderHook(() => useMetadataColumns("sync", true));
    expect(reloaded.result.current.metadataColumns).toEqual([
      { ...repo, visible: false },
    ]);
  });

  it("switches projects without persisting the previous project's layout", () => {
    localStorage.setItem(keyFor("a"), JSON.stringify([repo]));
    localStorage.setItem(
      keyFor("b"),
      JSON.stringify([{ ...repo, label: "Other" }]),
    );
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { result, rerender } = renderHook(
      ({ project }) => useMetadataColumns(project, true),
      { initialProps: { project: "a" } },
    );
    expect(result.current.metadataColumns).toEqual([repo]);
    rerender({ project: "b" });
    expect(result.current.metadataColumns).toEqual([
      { ...repo, label: "Other" },
    ]);
    expect(writes).not.toHaveBeenCalled();
    act(() => result.current.setMetadataColumns([]));
    expect(JSON.parse(localStorage.getItem(keyFor("a"))!)).toEqual([repo]);
    expect(localStorage.getItem(keyFor("b"))).toBe("[]");
  });

  it("does not read or write preferences while disabled", () => {
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useMetadataColumns("disabled", false));
    act(() => result.current.setMetadataColumns([repo]));
    expect(result.current.metadataColumns).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it("responds to another tab's changes and clear without writing them back", () => {
    const { result } = renderHook(() => useMetadataColumns("external", true));
    act(() => {
      localStorage.setItem(keyFor("external"), JSON.stringify([repo]));
      window.dispatchEvent(
        new StorageEvent("storage", { key: keyFor("external") }),
      );
    });
    expect(result.current.metadataColumns).toEqual([repo]);
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.metadataColumns).toEqual([]);
  });

  it.each([
    "bad json",
    "null",
    "{}",
    '[{"key":"repo","visible":"yes","position":0}]',
  ])("ignores invalid stored config %s without eager rewrites", (raw) => {
    localStorage.setItem(keyFor("invalid"), raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useMetadataColumns("invalid", true));
    expect(result.current.metadataColumns).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });

  it("keeps in-memory edits usable when browser storage is unavailable", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Unavailable", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const first = renderHook(() => useMetadataColumns("unavailable", true));
    const second = renderHook(() => useMetadataColumns("unavailable", true));
    expect(() =>
      act(() => first.result.current.setMetadataColumns([repo])),
    ).not.toThrow();
    expect(second.result.current.metadataColumns).toEqual([repo]);
    expect(errors).not.toHaveBeenCalled();
  });
});
