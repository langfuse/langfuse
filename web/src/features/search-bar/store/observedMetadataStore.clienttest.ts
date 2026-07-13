import { describe, expect, it } from "vitest";

import {
  mergeIntoProject,
  useObservedMetadataStore,
} from "./observedMetadataStore";
import {
  MAX_PATHS_PER_PROJECT,
  MAX_VALUES_PER_KEY,
  MAX_VALUES_PER_PROJECT,
  type StoredKeyInfo,
} from "../lib/metadata-paths";

const paths = (entries: Record<string, StoredKeyInfo>) =>
  new Map(Object.entries(entries));

describe("mergeIntoProject", () => {
  it("creates a project entry and merges types on later observations", () => {
    const first = mergeIntoProject(
      {},
      "p1",
      paths({ a: { type: "number" } }),
      1000,
    );
    expect(first?.p1).toEqual({
      paths: { a: { type: "number" } },
      updatedAt: 1000,
    });

    const second = mergeIntoProject(
      first!,
      "p1",
      paths({ a: { type: "string" }, b: { type: "boolean" } }),
      2000,
    );
    expect(second?.p1.paths).toEqual({
      a: { type: "mixed" },
      b: { type: "boolean" },
    });
    expect(second?.p1.updatedAt).toBe(2000);
  });

  it("unions values per key up to the cap, first-observed wins", () => {
    const base = mergeIntoProject(
      {},
      "p1",
      paths({ region: { type: "string", values: ["eu", "us"] } }),
      1000,
    )!;
    const merged = mergeIntoProject(
      base,
      "p1",
      paths({
        region: {
          type: "string",
          values: ["us", "apac", "mena", "latam", "antarctica"],
        },
      }),
      2000,
    );
    // "us" deduped; new ones appended until MAX_VALUES_PER_KEY.
    expect(merged?.p1.paths.region?.values).toEqual([
      "eu",
      "us",
      "apac",
      "mena",
      "latam",
    ]);
    expect(merged?.p1.paths.region?.values).toHaveLength(MAX_VALUES_PER_KEY);
  });

  it("enforces the per-project total value cap as a backstop", () => {
    // Through normal input the total is bounded by keys × values-per-key
    // (200 × 5 = 1000 < 1024), so the backstop only binds against drifted
    // PERSISTED state — an older schema or tampered localStorage. Simulate
    // that: one key already holding far more values than today's per-key cap.
    const drifted = {
      p1: {
        paths: {
          bulk: {
            type: "string" as const,
            values: Array.from(
              { length: MAX_VALUES_PER_PROJECT - 2 },
              (_, i) => `v${i}`,
            ),
          },
        },
        updatedAt: 1000,
      },
    };
    const merged = mergeIntoProject(
      drifted,
      "p1",
      paths({ fresh: { type: "string", values: ["a", "b", "c", "d"] } }),
      2000,
    );
    // Room for only 2 more values project-wide; the key itself registers.
    expect(merged?.p1.paths.fresh).toEqual({
      type: "string",
      values: ["a", "b"],
    });
  });

  it("returns null (no persist) when nothing changed recently", () => {
    const base = mergeIntoProject(
      {},
      "p1",
      paths({ a: { type: "number", values: ["1"] } }),
      1000,
    )!;
    expect(
      mergeIntoProject(
        base,
        "p1",
        paths({ a: { type: "number", values: ["1"] } }),
        2000,
      ),
    ).toBe(null);
    // Empty analysis never touches the store.
    expect(mergeIntoProject(base, "p1", new Map(), 2000)).toBe(null);
  });

  it("refreshes the LRU stamp of an unchanged-but-active project once stale", () => {
    const base = mergeIntoProject(
      {},
      "p1",
      paths({ a: { type: "number" } }),
      1000,
    )!;
    const dayLater = 1000 + 25 * 60 * 60 * 1000;
    const touched = mergeIntoProject(
      base,
      "p1",
      paths({ a: { type: "number" } }),
      dayLater,
    );
    expect(touched?.p1.updatedAt).toBe(dayLater);
    expect(touched?.p1.paths).toBe(base.p1!.paths);
  });

  it("enforces the per-project key cap, keeping existing keys", () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT }, (_, i) => [
        `k${i}`,
        { type: "string" } as StoredKeyInfo,
      ]),
    );
    const base = mergeIntoProject({}, "p1", paths(full), 1000)!;
    const merged = mergeIntoProject(
      base,
      "p1",
      paths({ overflow: { type: "number" }, k0: { type: "number" } }),
      2000,
    );
    // The new key is dropped; the existing key still merges its type.
    expect(merged?.p1.paths.overflow).toBeUndefined();
    expect(merged?.p1.paths.k0?.type).toBe("mixed");
    expect(Object.keys(merged!.p1!.paths)).toHaveLength(MAX_PATHS_PER_PROJECT);
  });

  it("evicts the least-recently-updated projects beyond the cap", () => {
    let byProject = {};
    for (let i = 0; i < 21; i++) {
      byProject = mergeIntoProject(
        byProject,
        `p${i}`,
        paths({ a: { type: "string" } }),
        1000 + i,
      )!;
    }
    expect(Object.keys(byProject)).toHaveLength(20);
    expect(byProject).not.toHaveProperty("p0");
    expect(byProject).toHaveProperty("p20");
  });

  it("types keys shadowing Object.prototype members correctly", () => {
    // `nextPaths["toString"]` must not read the inherited function as the
    // "existing" entry — that would skip the cap counter and pin the type to
    // "mixed" forever (review find: greptile/claude on PR #14771). Built from
    // tuples, not an object literal: TS contextual typing breaks on literal
    // properties named after Object.prototype members (the values widen to
    // `string` and fail assignability — broke the `next build` type pass
    // before clienttest files were covered by the regular typecheck).
    const shadowing = new Map<string, StoredKeyInfo>([
      ["toString", { type: "string", values: ["hello"] }],
      ["constructor", { type: "number", values: ["1"] }],
      ["hasOwnProperty", { type: "boolean" }],
    ]);
    const merged = mergeIntoProject({}, "p1", shadowing, 1000);
    expect(merged?.p1.paths.toString).toEqual({
      type: "string",
      values: ["hello"],
    });
    expect(merged?.p1.paths.constructor).toEqual({
      type: "number",
      values: ["1"],
    });
    expect(merged?.p1.paths.hasOwnProperty).toEqual({ type: "boolean" });
    // Re-merging the same observation stays a no-op (types stable, no churn).
    expect(
      mergeIntoProject(
        merged!,
        "p1",
        new Map<string, StoredKeyInfo>([
          ["toString", { type: "string", values: ["hello"] }],
        ]),
        2000,
      ),
    ).toBe(null);
  });

  it("scopes paths per project (no cross-bleed)", () => {
    const one = mergeIntoProject(
      {},
      "p1",
      paths({ a: { type: "number" } }),
      1000,
    )!;
    const two = mergeIntoProject(
      one,
      "p2",
      paths({ b: { type: "string" } }),
      2000,
    )!;
    expect(two.p1?.paths).toEqual({ a: { type: "number" } });
    expect(two.p2?.paths).toEqual({ b: { type: "string" } });
  });
});

describe("useObservedMetadataStore", () => {
  it("records paths through the action and exposes them per project", () => {
    useObservedMetadataStore.setState({ byProject: {} });
    useObservedMetadataStore
      .getState()
      .actions.recordPaths(
        "proj",
        paths({ "routing.queue": { type: "string", values: ["billing"] } }),
      );
    expect(useObservedMetadataStore.getState().byProject.proj?.paths).toEqual({
      "routing.queue": { type: "string", values: ["billing"] },
    });
  });
});
