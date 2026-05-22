import { describe, expect, it } from "vitest";
import { matchesTriggerFilter } from "./automations";
import type { FilterState } from "../types";

describe("matchesTriggerFilter", () => {
  describe("filter conditions", () => {
    it("returns true when the filter is empty and eventActions is empty", () => {
      expect(
        matchesTriggerFilter(
          { Name: "anything" },
          { filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("returns true when data satisfies a string filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter({ Name: "p95" }, { filter, eventActions: [] }),
      ).toBe(true);
    });

    it("returns false when data does not satisfy a string filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { Name: "error rate" },
          { filter, eventActions: [] },
        ),
      ).toBe(false);
    });

    it("returns false when data is missing the column referenced by the filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(matchesTriggerFilter({}, { filter, eventActions: [] })).toBe(
        false,
      );
    });
  });

  describe("eventActions merge", () => {
    it("matches when data.action is in eventActions", () => {
      expect(
        matchesTriggerFilter(
          { action: "created" },
          { filter: [], eventActions: ["created", "updated"] },
        ),
      ).toBe(true);
    });

    it("rejects when data.action is not in eventActions", () => {
      expect(
        matchesTriggerFilter(
          { action: "deleted" },
          { filter: [], eventActions: ["created", "updated"] },
        ),
      ).toBe(false);
    });

    it("rejects when data has no action and eventActions is non-empty", () => {
      expect(
        matchesTriggerFilter({}, { filter: [], eventActions: ["created"] }),
      ).toBe(false);
    });

    it("ignores eventActions when the array is empty", () => {
      // No synthetic condition appended, so data without an action still matches.
      expect(
        matchesTriggerFilter(
          { action: "anything" },
          { filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("evaluates both the user filter and the synthetic action condition", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];

      expect(
        matchesTriggerFilter(
          { Name: "p95", action: "created" },
          { filter, eventActions: ["created"] },
        ),
      ).toBe(true);

      // Filter matches but action doesn't → rejected
      expect(
        matchesTriggerFilter(
          { Name: "p95", action: "updated" },
          { filter, eventActions: ["created"] },
        ),
      ).toBe(false);

      // Action matches but filter doesn't → rejected
      expect(
        matchesTriggerFilter(
          { Name: "other", action: "created" },
          { filter, eventActions: ["created"] },
        ),
      ).toBe(false);
    });
  });
});
