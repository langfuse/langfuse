import { describe, expect, it } from "vitest";

import { groupScoreRowsByPrefix } from "./groupScoreRows";

const numeric = (id: string, name: string, value: number) => ({
  id,
  name,
  dataType: "NUMERIC",
  value,
  stringValue: null,
});
const boolean = (id: string, name: string, value: 0 | 1) => ({
  id,
  name,
  dataType: "BOOLEAN",
  value,
  stringValue: value ? "True" : "False",
});
const categorical = (id: string, name: string, stringValue: string) => ({
  id,
  name,
  dataType: "CATEGORICAL",
  value: null,
  stringValue,
});

// Table order: timestamp desc, groups interleaved, as the server returns them.
const rows = [
  numeric("1", "load-test-score", 0.42),
  numeric("2", "Moderation.toxicity", 0.5),
  boolean("3", "Gate.in_scope", 1),
  numeric("4", "Moderation.copyright", 1),
  categorical("5", "Moderation.weapons", "n/a"),
  numeric("6", "helpfulness", 0.91),
  boolean("7", "Gate.has_pii", 0),
  numeric("8", "gpt-4.1", 0.3),
];

describe("groupScoreRowsByPrefix", () => {
  it("orders grouped rows first, metric name within, then ungrouped rows in table order", () => {
    const {
      rows: ordered,
      headerBefore,
      groupOf,
    } = groupScoreRowsByPrefix(rows, (row) => row);

    expect(ordered.map((row) => row.name)).toEqual([
      "Gate.has_pii",
      "Gate.in_scope",
      "Moderation.copyright",
      "Moderation.toxicity",
      "Moderation.weapons",
      "load-test-score",
      "helpfulness",
      "gpt-4.1",
    ]);
    expect([...headerBefore.entries()]).toEqual([
      ["7", { prefix: "Gate", count: 2, summary: "1/2 true" }],
      // "n/a" is a placeholder: counted, left out of the average.
      ["4", { prefix: "Moderation", count: 3, summary: "Avg 0.75" }],
    ]);
    expect(groupOf.get("1")).toBeUndefined();
    expect(groupOf.get("8")).toBeUndefined();
    expect(groupOf.get("5")).toBe("Moderation");
  });
});
