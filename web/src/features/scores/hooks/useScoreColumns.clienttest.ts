import { describe, expect, it } from "vitest";
import { createScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";

const column = {
  key: "persona_fit-api-NUMERIC",
  name: "persona_fit",
  source: "API",
  dataType: "NUMERIC" as const,
};

const build = (prefix?: string, headerPrefix?: string) =>
  createScoreColumns<{ scores: Record<string, unknown> }>({
    scoreColumns: [column],
    scoreColumnKey: "scores",
    displayFormat: "aggregate",
    prefix,
    headerPrefix,
  })[0];

describe("createScoreColumns headers", () => {
  it("leads with the score name and trails the level", () => {
    // A score column is narrow and truncates from the right, so anything ahead
    // of the name hides the one part that identifies the column.
    expect(build("Trace").header).toBe("# persona_fit (api) · Trace");
  });

  it("omits the separator when there is no level", () => {
    expect(build().header).toBe("# persona_fit (api)");
  });

  it("keeps the level out of the column id, so persisted layouts survive", () => {
    expect(build("Trace").id).toBe("Trace-persona_fit-api-NUMERIC");
  });

  it("renames the level in the header without moving the column id", () => {
    const renamed = build("Trace", "Trace Item");

    expect(renamed.header).toBe("# persona_fit (api) · Trace Item");
    expect(renamed.id).toBe("Trace-persona_fit-api-NUMERIC");
  });
});
