import { describe, expect, it } from "vitest";
import { ObservationType, sessionTraceFilterSchema } from "@langfuse/shared";
import {
  applyPick,
  flattenOptions,
  planInputCompletions,
} from "@/src/features/search-bar/lib/completions";
import {
  extendFieldRegistryWithColumns,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { SESSION_TRACE_FIELD_REGISTRY } from "./sessionTraceSearchRegistry";

describe("session trace search registry", () => {
  const observed = {
    type: Object.values(ObservationType).map((value) => ({ value })),
    name: [{ value: "agent" }],
    level: [{ value: "ERROR" }],
  };
  const completions = (input: string) =>
    planInputCompletions(
      {
        input,
        caret: input.length,
        currentQueryText: input,
        observed,
        recents: [],
      },
      SESSION_TRACE_FIELD_REGISTRY,
    );

  it.each(["type:", "type:GEN"])(
    "suggests static exact types for %s",
    (input) => {
      const plan = completions(input);
      const options = flattenOptions(plan);
      expect(options.some((option) => option.label === "GENERATION")).toBe(
        true,
      );
      if (input === "type:")
        expect(options.some((option) => option.label === "SPAN")).toBe(true);
      const generation = options.find(
        (option) => option.kind === "value" && option.value === "GENERATION",
      );
      expect(plan?.requestColumns).toBeUndefined();
      expect(plan?.loading).toBe(false);
      if (!plan || !generation || generation.kind !== "value")
        throw new Error("Missing type completion");
      const edit = applyPick(generation, input, plan);
      expect(edit.next.trim()).toBe("type:=GENERATION");
      const result = planCommit(
        edit.next,
        undefined,
        SESSION_TRACE_FIELD_REGISTRY,
      );
      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(result.filters).toEqual([
        { column: "type", type: "string", operator: "=", value: "GENERATION" },
      ]);
    },
  );

  it.each([
    "",
    "has",
    "name:agent",
    "-",
    "NOT ",
    "-type:",
    "-level:",
    "-isRootObservation:",
  ])("only advertises supported edits for %s", (input) => {
    const plan = completions(input);
    const options = flattenOptions(plan);
    expect(
      options.some(
        (option) => option.id.includes("has") || option.id.includes("presence"),
      ),
    ).toBe(false);
    if (input === "-" || input === "NOT ") {
      expect(
        options
          .filter((option) => option.kind === "field")
          .map((option) => option.fieldId)
          .sort(),
      ).toEqual(["name", "traceName"]);
    }
    if (
      input.startsWith("-type:") ||
      input.startsWith("-level:") ||
      input.startsWith("-isRootObservation:")
    )
      expect(options).toEqual([]);
    if (!plan) return;
    for (const option of options) {
      if (option.kind !== "value" && option.kind !== "pattern") continue;
      expect(
        planCommit(
          applyPick(option, input, plan).next,
          undefined,
          SESSION_TRACE_FIELD_REGISTRY,
        ).status,
      ).toBe("committed");
    }
  });

  it.each([
    "has:name",
    "-has:name",
    "name:agent*",
    "name:*agent",
    "traceName:chat*",
    "type:GENERATION",
    "type:*GENERATION*",
    "-type:=GENERATION",
    "NOT type:=SPAN",
    "level:ERROR",
    "-level:ERROR",
    "NOT level:=ERROR",
    "-isRootObservation:true",
    "NOT isRootObservation:false",
    "type:(GENERATION OR SPAN)",
    "name:(agent OR tool)",
    "level:(ERROR OR WARNING)",
  ])("rejects unsupported typed query %s", (input) => {
    expect(
      planCommit(input, undefined, SESSION_TRACE_FIELD_REGISTRY).status,
    ).toBe("invalid");
  });

  it.each([
    "name:agent",
    "name:=agent",
    "name:*agent*",
    "-name:agent",
    "-name:=agent",
    "-name:*agent*",
    "observationName:agent",
    "traceName:chat",
    "-traceName:=chat",
    "level:=ERROR",
    "isRootObservation:true",
    "isRootObservation:=false",
  ])("accepts supported query %s", (input) => {
    expect(
      planCommit(input, undefined, SESSION_TRACE_FIELD_REGISTRY).status,
    ).toBe("committed");
  });

  it.each(["type:(GEN OR SPAN)", "name:(agent OR tool)", "type:GEN,SPAN"])(
    "does not offer uncommittable grouped edits for %s",
    (input) => {
      const plan = completions(input);
      if (!plan) return;
      for (const option of flattenOptions(plan)) {
        if (option.kind === "recent" || option.kind === "preset") continue;
        expect(
          planCommit(
            applyPick(option, input, plan).next,
            undefined,
            SESSION_TRACE_FIELD_REGISTRY,
          ).status,
        ).toBe("committed");
      }
    },
  );

  it.each(["type:(GEN OR SPAN)", "level:(ERR OR WARNING)"])(
    "does not suggest edits inside unsupported groups: %s",
    (input) => {
      const caret = input.indexOf(" OR");
      const plan = planInputCompletions(
        { input, caret, currentQueryText: input, observed, recents: [] },
        SESSION_TRACE_FIELD_REGISTRY,
      );
      expect(flattenOptions(plan)).toEqual([]);
    },
  );

  it("validates presets and preserves policy through registry enrichment", () => {
    const registry = withFieldOptions(
      extendFieldRegistryWithColumns(SESSION_TRACE_FIELD_REGISTRY, []),
      "type",
      [{ value: "GENERATION" }],
    );
    expect(registry.allowPresence).toBe(false);
    expect(registry.resolveField("has")).toBeNull();
    expect(registry.resolveField("type")).toEqual(
      expect.objectContaining({
        field: expect.objectContaining({
          operators: ["exact"],
          negatedOperators: [],
          exactSuggestions: true,
        }),
      }),
    );
    expect(planCommit("-type:=GENERATION", undefined, registry).status).toBe(
      "invalid",
    );
    const plan = planInputCompletions(
      {
        input: "",
        caret: 0,
        currentQueryText: "",
        observed,
        recents: [],
        presetSections: [
          {
            title: "Presets",
            options: [
              { id: "unsupported", label: "Unsupported", query: "has:name" },
              {
                id: "supported",
                label: "Supported",
                query: "type:=GENERATION",
              },
            ],
          },
        ],
      },
      registry,
    );
    expect(
      flattenOptions(plan)
        .filter((option) => option.kind === "preset")
        .map((option) => option.id),
    ).toEqual(["supported"]);
  });
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
