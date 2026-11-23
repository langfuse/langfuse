import { toApiReadMappings } from "@/src/features/public-api/server/evaluation/evaluationAdapters";

describe("toApiReadMappings", () => {
  it("reads snake-case tool call mappings", () => {
    expect(
      toApiReadMappings([
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
        {
          templateVariable: "tool_calls",
          selectedColumnId: "tool_calls",
          jsonSelector: null,
        },
      ]),
    ).toEqual([
      { variable: "input", source: "input" },
      { variable: "output", source: "output" },
      { variable: "tool_calls", source: "tool_calls" },
    ]);
  });

  it("reads unknown column ids as a null source instead of failing", () => {
    expect(
      toApiReadMappings([
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
        {
          templateVariable: "thread",
          selectedColumnId: "threads",
          jsonSelector: null,
        },
        {
          templateVariable: "inherited",
          selectedColumnId: "constructor",
          jsonSelector: null,
        },
      ]),
    ).toEqual([
      { variable: "input", source: "input" },
      { variable: "thread", source: null },
      { variable: "inherited", source: null },
    ]);
  });
});
