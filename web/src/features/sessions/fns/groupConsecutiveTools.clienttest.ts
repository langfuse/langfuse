import { describe, expect, it } from "vitest";
import { groupConsecutiveTools } from "./groupConsecutiveTools";

const options = {
  isTool: (row: { role: string }) => row.role === "tool",
  getName: (row: { name: string }) => row.name,
  getBoundary: (row: { boundary: number }) => row.boundary,
};

describe("groupConsecutiveTools", () => {
  it("counts repeated names and preserves original tools", () => {
    const rows = Array.from({ length: 5 }, () => ({
      role: "tool",
      name: "tool_1",
      boundary: 0,
    }));
    expect(groupConsecutiveTools(rows, options)).toEqual([
      { type: "tools", rows, summary: "5× tool_1" },
    ]);
  });

  it("joins distinct names and counts repeated names in mixed groups", () => {
    const rows = ["tool_a", "tool_a", "tool_a", "tool_b"].map((name) => ({
      role: "tool",
      name,
      boundary: 0,
    }));
    expect(groupConsecutiveTools(rows, options)).toEqual([
      { type: "tools", rows, summary: "3× tool_a and tool_b" },
    ]);
  });

  it("uses a count when the summary exceeds 60 characters", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      role: "tool",
      name: `very_long_tool_name_${index}`,
      boundary: 0,
    }));
    expect(groupConsecutiveTools(rows, options)).toEqual([
      { type: "tools", rows, summary: "7 tools" },
    ]);
  });

  it("does not group across messages or original run boundaries", () => {
    const rows = [
      { role: "tool", name: "tool_a", boundary: 0 },
      { role: "assistant", name: "message", boundary: 0 },
      { role: "tool", name: "tool_b", boundary: 0 },
      { role: "tool", name: "tool_c", boundary: 1 },
    ];
    expect(groupConsecutiveTools(rows, options)).toEqual(
      rows.map((row) => ({ type: "row", row })),
    );
  });
});
