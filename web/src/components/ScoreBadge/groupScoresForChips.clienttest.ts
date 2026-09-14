import { describe, expect, it } from "vitest";

import { groupScoresForChips, groupSummary } from "./groupScoresForChips";

const score = (name: string, value: number) => ({ name, value });

const summarize = <T extends { name: string }>(
  groups: ReturnType<typeof groupScoresForChips<T>>,
) =>
  groups.map((group) => ({
    kind: group.kind,
    label: group.label,
    names: group.scores.map((s) => s.name),
  }));

describe("groupScoresForChips", () => {
  it("collapses names sharing a prefix into one score group", () => {
    const groups = groupScoresForChips([
      score("OutputModerationPrecision.toxicity", 0.1),
      score("helpfulness", 0.9),
      score("OutputModerationPrecision.pii", 0.2),
      score("OutputModerationPrecision.hate", 0.3),
    ]);

    expect(summarize(groups)).toEqual([
      {
        kind: "group",
        label: "OutputModerationPrecision",
        names: [
          "OutputModerationPrecision.toxicity",
          "OutputModerationPrecision.pii",
          "OutputModerationPrecision.hate",
        ],
      },
      { kind: "name", label: "helpfulness", names: ["helpfulness"] },
    ]);
  });

  it("keeps a lone prefixed name as a plain name chip", () => {
    const groups = groupScoresForChips([
      score("gpt-4.1", 0.5),
      score("helpfulness", 0.9),
    ]);

    expect(summarize(groups)).toEqual([
      { kind: "name", label: "gpt-4.1", names: ["gpt-4.1"] },
      { kind: "name", label: "helpfulness", names: ["helpfulness"] },
    ]);
  });

  it("mixes score groups, lone prefixed names and repeated plain names", () => {
    const groups = groupScoresForChips([
      score("helpfulness", 0.9),
      score("Eval:relevance", 0.7),
      score("Other/single", 0.4),
      score("helpfulness", 0.8),
      score("Eval:faithfulness", 0.6),
      score(".leading", 0.1),
      score("trailing.", 0.2),
    ]);

    expect(summarize(groups)).toEqual([
      { kind: "name", label: ".leading", names: [".leading"] },
      {
        kind: "group",
        label: "Eval",
        names: ["Eval:relevance", "Eval:faithfulness"],
      },
      { kind: "name", label: "Other/single", names: ["Other/single"] },
      {
        kind: "name",
        label: "helpfulness",
        names: ["helpfulness", "helpfulness"],
      },
      { kind: "name", label: "trailing.", names: ["trailing."] },
    ]);
  });

  it("summarises single-type groups, skipping unscored placeholders, and none for mixed", () => {
    const numeric = (name: string, value: number) => ({
      name,
      dataType: "NUMERIC",
      value,
      stringValue: null,
    });
    const categorical = (name: string, stringValue: string) => ({
      name,
      dataType: "CATEGORICAL",
      value: null,
      stringValue,
    });
    const [placeholders] = groupScoresForChips([
      numeric("Mod.toxicity", 0.5),
      numeric("Mod.copyright", 1),
      categorical("Mod.weapons", " N/A "),
    ]);
    // Placeholder counts as a metric, not toward the average or the type.
    expect(groupSummary(placeholders!)).toEqual({ count: 3, text: "Avg 0.75" });

    const [mixed] = groupScoresForChips([
      numeric("Mod.toxicity", 0.5),
      categorical("Mod.severity", "high"),
    ]);
    expect(groupSummary(mixed!)).toEqual({ count: 2, text: null });
  });
});
