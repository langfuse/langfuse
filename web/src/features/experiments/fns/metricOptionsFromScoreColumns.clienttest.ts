import { describe, expect, it } from "vitest";
import { metricOptionsFromScoreColumns } from "./metricOptionsFromScoreColumns";

describe("metricOptionsFromScoreColumns", () => {
  it("preserves raw names, merges sources and retains the supported value kinds", () => {
    const options = metricOptionsFromScoreColumns(
      [
        { name: "quality.v1", dataType: "NUMERIC" },
        { name: "quality.v1", dataType: "NUMERIC" },
        { name: "quality-v1", dataType: "NUMERIC" },
        { name: "passed", dataType: "BOOLEAN" },
        { name: "notes", dataType: "TEXT" },
      ],
      [{ name: "verdict", dataType: "CATEGORICAL" }],
    );
    expect(
      options
        .filter((o) => o.group === "Scores")
        .map((o) => [o.id, o.valueKind]),
    ).toEqual([
      ["obs-score-numeric:passed", "boolean"],
      ["obs-score-numeric:quality-v1", "numeric"],
      ["obs-score-numeric:quality.v1", "numeric"],
      ["experiment-score-categorical:verdict", "categorical"],
    ]);
  });
});
