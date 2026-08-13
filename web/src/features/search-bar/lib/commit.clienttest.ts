import { planCommit } from "@/src/features/search-bar/lib/commit";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const experimentAndEvalExclusions = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
  {
    column: "experimentId",
    type: "null",
    operator: "is null",
    value: "",
  },
] as const;

describe("planCommit", () => {
  it("lowers a valid draft to filters + search + canonical text", () => {
    const r = planCommit("  level:ERROR timeout  ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    expect(r.searchQuery).toBe("timeout");
    // Bare free text uses the default scope: ids+names+input+output.
    expect(r.searchType).toEqual(["id", "content"]);
    // Canonical text preserves the parsed (typed) order.
    expect(r.canonical).toBe("level:ERROR timeout");
  });

  it("applies the default searchType (ids+names+input+output)", () => {
    const r = planCommit("level:ERROR");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.searchType).toEqual(["id", "content"]);
    expect(r.searchQuery).toBeNull();
  });

  it("treats an empty draft as a committed empty query", () => {
    const r = planCommit("   ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([]);
    expect(r.searchQuery).toBeNull();
    expect(r.canonical).toBe("");
  });

  it.each([
    ["sample observation filters", undefined],
    ["rule filters", RULE_FIELD_REGISTRY],
  ])("expands the experiments-and-evals alias for %s", (_name, registry) => {
    const r = planCommit("-experiments-and-evals", undefined, registry);
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual(experimentAndEvalExclusions);
    expect(r.searchQuery).toBeNull();
    expect(r.canonical).toBe("-experiments-and-evals");
  });

  it("rejects an alias that is not registered for the current view", () => {
    const registry = fieldRegistryFromColumns([], {
      id: "evaluationRules",
      allowFreeText: false,
    });

    expect(
      planCommit("-experiments-and-evals", undefined, registry).status,
    ).toBe("invalid");
  });

  it("returns invalid with diagnostics for unrepresentable queries", () => {
    const r = planCommit("level:ERROR OR env:dev");
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it("blocks commit when validation and lowering disagree (score-type parity)", () => {
    // `accuracy` is a numeric score, so `accuracy:hello` can't lower. The
    // validity check must see the same scoreTypes the lowering does — otherwise
    // it commits an empty filter set and the user's input silently vanishes.
    const scoreTypes = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const r = planCommit("scores.accuracy:hello", scoreTypes);
    expect(r.status).toBe("invalid");
  });
});
