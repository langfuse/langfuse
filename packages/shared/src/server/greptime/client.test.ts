import { describe, expect, it } from "vitest";

import { keysetCursorPredicate } from "./client";

describe("keysetCursorPredicate", () => {
  it("builds a plain comparison for a single cursor column", () => {
    expect(keysetCursorPredicate(["timestamp"], "ASC")).toBe(
      "`timestamp` > :cursor_0",
    );
    expect(keysetCursorPredicate(["timestamp"], "DESC")).toBe(
      "`timestamp` < :cursor_0",
    );
  });

  it("expands a composite cursor lexicographically (no SQL tuple compare)", () => {
    // (timestamp, project_id, id): rows sharing a timestamp must not be skipped.
    expect(
      keysetCursorPredicate(["timestamp", "project_id", "id"], "ASC"),
    ).toBe(
      "(`timestamp` > :cursor_0 OR (`timestamp` = :cursor_0 AND " +
        "(`project_id` > :cursor_1 OR (`project_id` = :cursor_1 AND `id` > :cursor_2))))",
    );
  });

  it("flips every comparison for DESC paging", () => {
    expect(keysetCursorPredicate(["start_time", "id"], "DESC")).toBe(
      "(`start_time` < :cursor_0 OR (`start_time` = :cursor_0 AND `id` < :cursor_1))",
    );
  });

  it("backtick-quotes identifiers (reserved words like timestamp/id)", () => {
    const sql = keysetCursorPredicate(["timestamp", "id"], "ASC");
    expect(sql).toContain("`timestamp`");
    expect(sql).toContain("`id`");
  });

  it("throws on an empty cursor column list", () => {
    expect(() => keysetCursorPredicate([], "ASC")).toThrow(
      /at least one cursor column/,
    );
  });

  it("quotes only the column under a table alias (dri.col -> dri.`col`)", () => {
    expect(
      keysetCursorPredicate(["dri.dataset_run_created_at", "dri.id"], "ASC"),
    ).toBe(
      "(dri.`dataset_run_created_at` > :cursor_0 OR " +
        "(dri.`dataset_run_created_at` = :cursor_0 AND dri.`id` > :cursor_1))",
    );
  });
});
