import { describe, expect, it } from "vitest";
import { matchesTriggerFilter } from "./automations";
import type { FilterState } from "../types";

describe("matchesTriggerFilter", () => {
  describe("filter conditions", () => {
    it("returns true when the filter is empty and eventActions is empty", () => {
      expect(
        matchesTriggerFilter(
          { Name: "anything", triggerIds: ["trig-test"] },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("returns true when data satisfies a string filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { Name: "p95", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: [] },
        ),
      ).toBe(true);
    });

    it("returns false when data does not satisfy a string filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { Name: "error rate", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: [] },
        ),
      ).toBe(false);
    });

    it("returns false when data is missing the column referenced by the filter", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: [] },
        ),
      ).toBe(false);
    });
  });

  describe("eventActions merge", () => {
    it("matches when data.action is in eventActions", () => {
      expect(
        matchesTriggerFilter(
          { action: "created", triggerIds: ["trig-test"] },
          {
            id: "trig-test",
            filter: [],
            eventActions: ["created", "updated"],
          },
        ),
      ).toBe(true);
    });

    it("rejects when data.action is not in eventActions", () => {
      expect(
        matchesTriggerFilter(
          { action: "deleted", triggerIds: ["trig-test"] },
          {
            id: "trig-test",
            filter: [],
            eventActions: ["created", "updated"],
          },
        ),
      ).toBe(false);
    });

    it("rejects when data has no action and eventActions is non-empty", () => {
      expect(
        matchesTriggerFilter(
          { triggerIds: ["trig-test"] },
          { id: "trig-test", filter: [], eventActions: ["created"] },
        ),
      ).toBe(false);
    });

    it("ignores eventActions when the array is empty", () => {
      // No synthetic condition appended, so data without an action still matches.
      expect(
        matchesTriggerFilter(
          { action: "anything", triggerIds: ["trig-test"] },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("evaluates both the user filter and the synthetic action condition", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];

      expect(
        matchesTriggerFilter(
          { Name: "p95", action: "created", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: ["created"] },
        ),
      ).toBe(true);

      // Filter matches but action doesn't → rejected
      expect(
        matchesTriggerFilter(
          { Name: "p95", action: "updated", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: ["created"] },
        ),
      ).toBe(false);

      // Action matches but filter doesn't → rejected
      expect(
        matchesTriggerFilter(
          { Name: "other", action: "created", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: ["created"] },
        ),
      ).toBe(false);
    });
  });

  describe("synthetic triggerIds clause (opt-in when data carries the field)", () => {
    it("matches when data.triggerIds contains trigger.id", () => {
      expect(
        matchesTriggerFilter(
          { triggerIds: ["trig-test"] },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("rejects when data.triggerIds does not contain trigger.id", () => {
      expect(
        matchesTriggerFilter(
          { triggerIds: ["other-trigger"] },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(false);
    });

    it("rejects when data.triggerIds is an empty array (opted-in mechanism, nothing listed)", () => {
      expect(
        matchesTriggerFilter(
          { triggerIds: [] },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(false);
    });

    it("skips the triggerIds clause when data has no triggerIds field at all", () => {
      // Regression: prompt-version events do not carry a triggerIds field, so
      // the synthetic clause must not gate them.
      expect(
        matchesTriggerFilter(
          { Name: "my-prompt", action: "created" },
          { id: "trig-prompt", filter: [], eventActions: ["created"] },
        ),
      ).toBe(true);
    });

    it("treats non-array triggerIds the same as missing (clause is skipped)", () => {
      expect(
        matchesTriggerFilter(
          { triggerIds: "trig-test" },
          { id: "trig-test", filter: [], eventActions: [] },
        ),
      ).toBe(true);
    });

    it("ANDs with user-supplied filter: rejects when filter does not match even if triggerIds matches", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { Name: "error rate", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: [] },
        ),
      ).toBe(false);
    });

    it("ANDs with user-supplied filter: matches when both filter and triggerIds match", () => {
      const filter: FilterState = [
        { type: "string", column: "Name", operator: "=", value: "p95" },
      ];
      expect(
        matchesTriggerFilter(
          { Name: "p95", triggerIds: ["trig-test"] },
          { id: "trig-test", filter, eventActions: [] },
        ),
      ).toBe(true);
    });
  });
});
