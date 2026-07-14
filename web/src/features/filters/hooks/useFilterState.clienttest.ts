import { describe, expect, it } from "vitest";

import {
  getColumnId,
  getColumnName,
} from "@/src/features/filters/lib/columnLookup";

const widgetsTable = {
  widgets: [
    { id: "environment", name: "Environment" },
    { id: "traceName", name: "Trace Name" },
    { id: "tags", name: "Tags" },
    { id: "release", name: "Release" },
    { id: "user", name: "User" },
    { id: "session", name: "Session" },
    { id: "version", name: "Version" },
  ],
} as const;

// Simulates the inline tableCols map in `useFilterState.ts`: shares the
// `traceName` id between widgets and dashboard but exposes different
// column sets. `toolNames` is a name that exists only in `widgets` so we
// can assert the lookup never crosses the table boundary.
const disjointTable = {
  widgets: [
    { id: "traceName", name: "Trace Name" },
    { id: "toolNames", name: "Tool Names" },
  ],
  dashboard: [
    { id: "traceName", name: "Trace Name" },
    { id: "sessionId", name: "Session ID" },
  ],
} as const;

describe("getColumnId", () => {
  describe("LLM-tolerant lookup", () => {
    it("resolves a column by its display name", () => {
      expect(getColumnId(widgetsTable, "widgets", "Trace Name")).toBe(
        "traceName",
      );
    });

    it("resolves a column by its stable id", () => {
      expect(getColumnId(widgetsTable, "widgets", "traceName")).toBe(
        "traceName",
      );
    });

    it("returns the same id regardless of whether the caller passes the display name or the id", () => {
      expect(getColumnId(widgetsTable, "widgets", "Trace Name")).toBe(
        getColumnId(widgetsTable, "widgets", "traceName"),
      );
    });
  });

  describe("table scoping", () => {
    it("does not leak columns defined only on one table into the other", () => {
      // `toolNames` exists only in the `widgets` registry; `sessionId`
      // exists only in the `dashboard` registry. The lookup must be
      // strictly scoped to the requested table.
      expect(getColumnId(disjointTable, "dashboard", "toolNames")).toBeUndefined();
      expect(getColumnId(disjointTable, "dashboard", "Tool Names")).toBeUndefined();

      expect(getColumnId(disjointTable, "widgets", "sessionId")).toBeUndefined();
      expect(getColumnId(disjointTable, "widgets", "Session ID")).toBeUndefined();
    });
  });

  describe("non-normalized input", () => {
    it("returns undefined for an unknown display name", () => {
      expect(
        getColumnId(widgetsTable, "widgets", "Unknown Column"),
      ).toBeUndefined();
    });

    it("returns undefined for whitespace-padded names (no implicit trimming)", () => {
      expect(
        getColumnId(widgetsTable, "widgets", "  Trace Name  "),
      ).toBeUndefined();
      expect(
        getColumnId(widgetsTable, "widgets", "\tTrace Name\n"),
      ).toBeUndefined();
    });

    it("returns undefined for case-mismatched names (no implicit lower-casing)", () => {
      expect(
        getColumnId(widgetsTable, "widgets", "trace name"),
      ).toBeUndefined();
      expect(getColumnId(widgetsTable, "widgets", "TRACENAME")).toBeUndefined();
    });

    it("returns undefined for empty input", () => {
      expect(getColumnId(widgetsTable, "widgets", "")).toBeUndefined();
    });
  });
});

describe("getColumnName", () => {
  it("resolves the display name for a column by its stable id", () => {
    expect(getColumnName(widgetsTable, "widgets", "traceName")).toBe(
      "Trace Name",
    );
  });

  it("returns undefined for an unknown id", () => {
    expect(
      getColumnName(widgetsTable, "widgets", "notARealColumn"),
    ).toBeUndefined();
  });

  it("does not perform the LLM-tolerance name-match fallback", () => {
    // `getColumnName` is the inverse of `getColumnId` and only accepts
    // stable ids. Passing a display name must not match.
    expect(getColumnName(widgetsTable, "widgets", "Trace Name")).toBeUndefined();
  });
});