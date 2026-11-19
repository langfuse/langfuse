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
import { validateQuery } from "@/src/features/search-bar/lib/validate";
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

  it.each(["type:", "type:GEN", "type:GENERATION"])(
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
      expect(plan?.autoHighlight).toBe(input !== "type:");
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

  it("keeps supported completions when an untouched term is invalid", () => {
    for (const [markedInput, expected] of [
      ["level:ERROR na|", "name"],
      ["na| level:ERROR", "name"],
      ["level:ERROR type:GEN|", "GENERATION"],
      ["type:GEN| level:ERROR", "GENERATION"],
      ["level:ERROR -type:GEN|", null],
      ["level:ERROR NOT type:GEN|", null],
      ["level:ERROR NOT (type:GEN|)", null],
      ["level:ERROR type:(GEN| OR SPAN)", "GENERATION"],
    ] as const) {
      const caret = markedInput.indexOf("|");
      const input = markedInput.replaceAll("|", "");
      const plan = planInputCompletions(
        { input, caret, currentQueryText: input, observed, recents: [] },
        SESSION_TRACE_FIELD_REGISTRY,
      );
      const options = flattenOptions(plan);
      if (expected === null) {
        expect(options).toEqual([]);
      } else {
        expect(
          options.some((option) => option.label === expected),
          markedInput,
        ).toBe(true);
      }
    }
  });

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
      ).toEqual(["isRootObservation", "name", "traceName"]);
    }
    if (input.startsWith("-type:") || input.startsWith("-level:"))
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
    ["-isRootObservation:true", false],
    ["NOT isRootObservation:false", true],
  ] as const)("inverts negated root filter %s", (input, value) => {
    const result = planCommit(input, undefined, SESSION_TRACE_FIELD_REGISTRY);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.filters).toEqual([
      { column: "isRootObservation", type: "boolean", operator: "=", value },
    ]);
  });

  it.each([
    ["name:agent*", "does not support starts-with"],
    ["type:GENERATION", "These filters are not supported"],
    ["-type:=GENERATION", "does not support negated exact"],
  ])("explains the unsupported operator in %s", (input, message) => {
    expect(
      validateQuery(input, undefined, SESSION_TRACE_FIELD_REGISTRY).diagnostics,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining(message) }),
      ]),
    );
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

  it.each([
    "level:(ERROR AND WARNING)",
    "environment:(production AND staging)",
  ])("does not suggest edits inside unsupported groups: %s", (input) => {
    const caret = input.indexOf(" AND");
    const plan = planInputCompletions(
      { input, caret, currentQueryText: input, observed, recents: [] },
      SESSION_TRACE_FIELD_REGISTRY,
    );
    expect(flattenOptions(plan)).toEqual([]);
  });

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
          operators: ["=", "exact"],
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

  it.each([
    ["type:(AGENT OR TOOL)", "type", ["AGENT", "TOOL"]],
    ["type:AGENT OR type:TOOL", "type", ["AGENT", "TOOL"]],
    ["level:(ERROR OR WARNING)", "level", ["ERROR", "WARNING"]],
    [
      "environment:(production OR staging)",
      "environment",
      ["production", "staging"],
    ],
  ])("round-trips grouped categorical filters: %s", (input, column, values) => {
    const result = planCommit(input, undefined, SESSION_TRACE_FIELD_REGISTRY);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    const filters = [
      {
        column,
        type: "stringOptions",
        operator: "any of",
        value: values,
      },
    ];
    expect(result.filters).toEqual(filters);
    expect(sessionTraceFilterSchema.parse(result.filters)).toEqual(filters);
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
    expect(restored.filters).toEqual(filters);
  });

  it.each([
    "type:AGENT OR level:ERROR",
    "level:ERROR OR environment:production",
    "-level:(ERROR OR WARNING)",
    "-environment:(production OR staging)",
  ])("rejects unsupported OR queries: %s", (input) => {
    expect(
      planCommit(input, undefined, SESSION_TRACE_FIELD_REGISTRY).status,
    ).toBe("invalid");
  });

  it.each([
    ["type:(AGENT OR TOO)", "type", "TOOL", ["AGENT", "TOOL"]],
    ["level:(WARNING OR ERR)", "level", "ERROR", ["WARNING", "ERROR"]],
  ])(
    "completes an OR group without replacing its other value: %s",
    (input, column, value, values) => {
      const plan = planInputCompletions(
        {
          input,
          caret: input.indexOf(")"),
          currentQueryText: input,
          observed,
          recents: [],
        },
        SESSION_TRACE_FIELD_REGISTRY,
      );
      const tool = flattenOptions(plan).find(
        (option) => option.kind === "value" && option.value === value,
      );
      if (!plan || !tool || tool.kind !== "value")
        throw new Error("Missing value completion");
      const result = planCommit(
        applyPick(tool, input, plan).next,
        undefined,
        SESSION_TRACE_FIELD_REGISTRY,
      );
      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(result.filters).toEqual([
        {
          column,
          type: "stringOptions",
          operator: "any of",
          value: values,
        },
      ]);
    },
  );
});
