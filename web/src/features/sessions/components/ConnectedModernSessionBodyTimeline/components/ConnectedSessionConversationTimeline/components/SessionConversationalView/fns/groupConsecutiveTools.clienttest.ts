import { describe, expect, it } from "vitest";
import { groupConsecutiveTools } from "./groupConsecutiveTools";

const options = {
  isTool: (row: { role: string }) => row.role === "tool",
  getBoundary: (row: { boundary: number }) => row.boundary,
  getToolName: (row: { name: string }) => row.name,
  summaryBudget: 36,
};

describe("groupConsecutiveTools", () => {
  it("fits measured glyph widths, including the conditional sidebar prefix", () => {
    const rows = ["iiii", "WWWW"].map((name) => ({
      role: "tool",
      name,
      boundary: 0,
    }));
    const measureSummary = (summary: string) => {
      const label = /^[0-9]+x\s/.test(summary) ? summary : `Tool: ${summary}`;
      return [...label].reduce(
        (width, character) => width + (character === "W" ? 8 : 1),
        0,
      );
    };
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        summaryBudget: 22,
        measureSummary,
      })[0],
    ).toMatchObject({ summary: "iiii · +1 more", title: "iiii · WWWW" });
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        summaryBudget: 45,
        measureSummary,
      })[0],
    ).toMatchObject({ summary: "iiii · WWWW" });
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        summaryBudget: 19,
        measureSummary,
      })[0],
    ).toMatchObject({ summary: "ii… · +1 more" });
  });

  it("reserves measured repetition counts, ellipsis, and omitted calls at the boundary", () => {
    const rows = ["WWWW", "WWWW", "read"].map((name) => ({
      role: "tool",
      name,
      boundary: 0,
    }));
    const measureSummary = (summary: string) =>
      [...summary].reduce(
        (width, character) => width + (character === "W" ? 8 : 1),
        0,
      );
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        summaryBudget: 22,
        measureSummary,
      })[0],
    ).toMatchObject({ summary: "2x W… · +1 more", title: "2x WWWW · read" });
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        summaryBudget: 21,
        measureSummary,
      })[0],
    ).toMatchObject({ summary: "2x … · +1 more" });
  });

  it("counts all tool calls in mixed groups", () => {
    const rows = ["tool_a", "tool_a", "tool_a", "tool_b"].map((name) => ({
      role: "tool",
      name,
      boundary: 0,
    }));
    expect(groupConsecutiveTools(rows, options)).toEqual([
      {
        type: "tools",
        rows,
        summary: "3x tool_a · tool_b",
        title: "3x tool_a · tool_b",
      },
    ]);
  });

  it("shows only fitting names and preserves full tooltip names", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      role: "tool",
      name: `very_long_tool_name_${index}`,
      boundary: 0,
    }));
    const group = groupConsecutiveTools(rows, options)[0]!;
    expect(group.type).toBe("tools");
    if (group.type !== "tools") return;
    expect(group.summary).toBe("very_long_tool_name_0 · +6 more");
    expect(group.summary.length).toBeLessThanOrEqual(36);
    expect(group.title).toBe(rows.map((row) => row.name).join(" · "));
    expect(
      groupConsecutiveTools(rows, { ...options, summaryBudget: 16 })[0],
    ).toMatchObject({ summary: "very_… · +6 more" });
  });

  it("ranks by frequency with stable ties and counts omitted calls", () => {
    const rows = [
      "read",
      "search",
      "other",
      "search",
      "read",
      "search",
      "last",
      "last",
      "search",
      "read",
    ].map((name) => ({ role: "tool", name, boundary: 0 }));
    const group = groupConsecutiveTools(rows, {
      ...options,
      summaryBudget: 27,
    })[0]!;
    expect(group).toMatchObject({
      summary: "4x search · +6 more",
      title: "4x search · 3x read · 2x last · other",
    });
  });

  it("falls back for missing and blank names", () => {
    const rows = [undefined, "  ", null].map((name) => ({
      role: "tool",
      name,
      boundary: 0,
    }));
    expect(
      groupConsecutiveTools(rows, {
        ...options,
        getToolName: (row) => row.name,
      })[0],
    ).toMatchObject({ summary: "3x Tool", title: "3x Tool" });
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
