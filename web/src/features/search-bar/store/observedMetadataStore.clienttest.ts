import { describe, expect, it } from "vitest";

import {
  mergeIntoProject,
  useObservedMetadataStore,
} from "./observedMetadataStore";
import {
  MAX_PATHS_PER_PROJECT,
  type StoredPathType,
} from "../lib/metadata-paths";

const paths = (entries: Record<string, StoredPathType>) =>
  new Map(Object.entries(entries));

describe("mergeIntoProject", () => {
  it("creates a project entry and merges types on later observations", () => {
    const first = mergeIntoProject({}, "p1", paths({ a: "number" }), 1000);
    expect(first?.p1).toEqual({ paths: { a: "number" }, updatedAt: 1000 });

    const second = mergeIntoProject(
      first!,
      "p1",
      paths({ a: "string", b: "boolean" }),
      2000,
    );
    expect(second?.p1.paths).toEqual({ a: "mixed", b: "boolean" });
    expect(second?.p1.updatedAt).toBe(2000);
  });

  it("returns null (no persist) when nothing changed recently", () => {
    const base = mergeIntoProject({}, "p1", paths({ a: "number" }), 1000)!;
    expect(mergeIntoProject(base, "p1", paths({ a: "number" }), 2000)).toBe(
      null,
    );
    // Empty analysis never touches the store.
    expect(mergeIntoProject(base, "p1", new Map(), 2000)).toBe(null);
  });

  it("refreshes the LRU stamp of an unchanged-but-active project once stale", () => {
    const base = mergeIntoProject({}, "p1", paths({ a: "number" }), 1000)!;
    const dayLater = 1000 + 25 * 60 * 60 * 1000;
    const touched = mergeIntoProject(
      base,
      "p1",
      paths({ a: "number" }),
      dayLater,
    );
    expect(touched?.p1.updatedAt).toBe(dayLater);
    expect(touched?.p1.paths).toBe(base.p1!.paths);
  });

  it("enforces the per-project path cap, keeping existing paths", () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT }, (_, i) => [
        `k${i}`,
        "string" as const,
      ]),
    );
    const base = mergeIntoProject({}, "p1", paths(full), 1000)!;
    const merged = mergeIntoProject(
      base,
      "p1",
      paths({ overflow: "number", k0: "number" }),
      2000,
    );
    // The new path is dropped; the existing path still merges its type.
    expect(merged?.p1.paths.overflow).toBeUndefined();
    expect(merged?.p1.paths.k0).toBe("mixed");
    expect(Object.keys(merged!.p1!.paths)).toHaveLength(MAX_PATHS_PER_PROJECT);
  });

  it("evicts the least-recently-updated projects beyond the cap", () => {
    let byProject = {};
    for (let i = 0; i < 21; i++) {
      byProject = mergeIntoProject(
        byProject,
        `p${i}`,
        paths({ a: "string" }),
        1000 + i,
      )!;
    }
    expect(Object.keys(byProject)).toHaveLength(20);
    expect(byProject).not.toHaveProperty("p0");
    expect(byProject).toHaveProperty("p20");
  });

  it("scopes paths per project (no cross-bleed)", () => {
    const one = mergeIntoProject({}, "p1", paths({ a: "number" }), 1000)!;
    const two = mergeIntoProject(one, "p2", paths({ b: "string" }), 2000)!;
    expect(two.p1?.paths).toEqual({ a: "number" });
    expect(two.p2?.paths).toEqual({ b: "string" });
  });
});

describe("useObservedMetadataStore", () => {
  it("records paths through the action and exposes them per project", () => {
    useObservedMetadataStore.setState({ byProject: {} });
    useObservedMetadataStore
      .getState()
      .actions.recordPaths("proj", paths({ "routing.queue": "string" }));
    expect(useObservedMetadataStore.getState().byProject.proj?.paths).toEqual({
      "routing.queue": "string",
    });
  });
});
