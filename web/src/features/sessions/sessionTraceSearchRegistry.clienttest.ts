import { describe, expect, it } from "vitest";
import { sessionTraceFilterSchema } from "@langfuse/shared";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { SESSION_TRACE_FIELD_REGISTRY } from "./sessionTraceSearchRegistry";

describe("session trace search registry", () => {
  it.each(["name", "traceName"])(
    "round-trips exact exclusions for %s",
    (column) => {
      const filters = sessionTraceFilterSchema.parse([
        {
          column,
          type: "stringOptions",
          operator: "none of",
          value: ["agent"],
        },
      ]);
      const query = filterStateToQueryText(
        filters,
        {},
        SESSION_TRACE_FIELD_REGISTRY,
      );
      expect(query.skippedFilters).toEqual([]);
      const restored = planCommit(
        query.text,
        undefined,
        SESSION_TRACE_FIELD_REGISTRY,
      );
      expect(restored.status).toBe("committed");
      if (restored.status !== "committed") return;
      expect(restored.filters).toEqual(filters);
    },
  );

  it("lowers trace and observation syntax into supported filters and round-trips saved views", () => {
    const result = planCommit(
      "traceName:chat name:=agent type:=GENERATION level:=ERROR isRootObservation:true",
      undefined,
      SESSION_TRACE_FIELD_REGISTRY,
    );
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(sessionTraceFilterSchema.safeParse(result.filters).success).toBe(
      true,
    );
    expect(result.filters.map(({ column }) => column)).toEqual([
      "traceName",
      "name",
      "type",
      "level",
      "isRootObservation",
    ]);
    const query = filterStateToQueryText(
      result.filters,
      {},
      SESSION_TRACE_FIELD_REGISTRY,
    );
    expect(query.skippedFilters).toEqual([]);
    const restored = planCommit(
      query.text,
      undefined,
      SESSION_TRACE_FIELD_REGISTRY,
    );
    expect(restored.status).toBe("committed");
    if (restored.status !== "committed") return;
    expect(restored.filters).toEqual(result.filters);
  });
});
