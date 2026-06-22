import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import {
  decodeFiltersGeneric,
  encodeFiltersGeneric,
} from "@/src/features/filters/lib/filter-query-encoding";
import { buildEventsTablePathForMetadataFilter } from "./eventsTablePaths";

const PROJECT = "p1";

const meta = (
  key: string,
  operator: "=" | "contains" | "does not contain" | "starts with" | "ends with",
  value: string,
): FilterState[number] =>
  ({
    column: "metadata",
    type: "stringObject",
    key,
    operator,
    value,
  }) as FilterState[number];

/** Build a `currentPath` the same way the events table encodes its URL. */
const currentPathWith = (
  filters: FilterState,
  opts: { dateRange?: string } = {},
): string => {
  const params = new URLSearchParams();
  if (filters.length > 0) params.set("filter", encodeFiltersGeneric(filters));
  if (opts.dateRange) params.set("dateRange", opts.dateRange);
  const q = params.toString();
  return `/project/${PROJECT}/observations${q ? `?${q}` : ""}`;
};

/** Decode the filters the builder produced back out of the result path. */
const filtersOf = (path: string): FilterState => {
  const url = new URL(path, "https://x.local");
  return decodeFiltersGeneric(url.searchParams.get("filter") ?? "");
};

const build = (
  currentPath: string,
  operator: "contains" | "does not contain",
  opts: {
    metadataKey?: string;
    value?: string;
    target?: "observations" | "traces";
  } = {},
) =>
  buildEventsTablePathForMetadataFilter({
    currentPath,
    projectId: PROJECT,
    metadataKey: opts.metadataKey ?? "scope",
    value: opts.value ?? "alpha",
    operator,
    target: opts.target ?? "observations",
  });

describe("buildEventsTablePathForMetadataFilter", () => {
  it("adds a single clause from an empty filter state", () => {
    const path = build("/project/p1/observations", "contains");
    expect(path.startsWith("/project/p1/observations?")).toBe(true);
    expect(filtersOf(path)).toEqual([meta("scope", "contains", "alpha")]);
  });

  it("routes to the requested table", () => {
    const path = build("/project/p1/traces", "contains", { target: "traces" });
    expect(path.startsWith("/project/p1/traces?")).toBe(true);
  });

  it("preserves the dateRange param", () => {
    const path = build(
      currentPathWith([], { dateRange: "All time" }),
      "contains",
    );
    const url = new URL(path, "https://x.local");
    expect(url.searchParams.get("dateRange")).toBe("All time");
  });

  it("toggles Include -> Exclude on the same value (replace, not AND)", () => {
    const path = build(
      currentPathWith([meta("scope", "contains", "alpha")]),
      "does not contain",
    );
    expect(filtersOf(path)).toEqual([
      meta("scope", "does not contain", "alpha"),
    ]);
  });

  it("toggles Exclude -> Include on the same value", () => {
    const path = build(
      currentPathWith([meta("scope", "does not contain", "alpha")]),
      "contains",
    );
    expect(filtersOf(path)).toEqual([meta("scope", "contains", "alpha")]);
  });

  it("is idempotent when re-adding the same clause", () => {
    const path = build(
      currentPathWith([meta("scope", "contains", "alpha")]),
      "contains",
    );
    expect(filtersOf(path)).toEqual([meta("scope", "contains", "alpha")]);
  });

  it("AND-merges clauses on a different key", () => {
    const path = build(
      currentPathWith([meta("env", "contains", "prod")]),
      "contains",
      { metadataKey: "scope", value: "alpha" },
    );
    expect(filtersOf(path)).toEqual([
      meta("env", "contains", "prod"),
      meta("scope", "contains", "alpha"),
    ]);
  });

  it("AND-merges clauses on the same key but a different value", () => {
    const path = build(
      currentPathWith([meta("scope", "contains", "alpha")]),
      "contains",
      { value: "beta" },
    );
    expect(filtersOf(path)).toEqual([
      meta("scope", "contains", "alpha"),
      meta("scope", "contains", "beta"),
    ]);
  });

  it("Include preserves a stricter '=' clause (no broadening)", () => {
    const path = build(
      currentPathWith([meta("scope", "=", "production")]),
      "contains",
      { value: "production" },
    );
    // `= production` is kept; the redundant `contains production` ANDs with it.
    expect(filtersOf(path)).toEqual([
      meta("scope", "=", "production"),
      meta("scope", "contains", "production"),
    ]);
  });

  it("Exclude drops a contradicting '=' clause on the same value", () => {
    const path = build(
      currentPathWith([meta("scope", "=", "production")]),
      "does not contain",
      { value: "production" },
    );
    // `= v AND does not contain v` is always false — the `=` must be dropped.
    expect(filtersOf(path)).toEqual([
      meta("scope", "does not contain", "production"),
    ]);
  });

  it("Exclude drops a contradicting 'starts with' clause on the same value", () => {
    const path = build(
      currentPathWith([meta("scope", "starts with", "production")]),
      "does not contain",
      { value: "production" },
    );
    expect(filtersOf(path)).toEqual([
      meta("scope", "does not contain", "production"),
    ]);
  });
});
