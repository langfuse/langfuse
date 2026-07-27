import {
  MARKDOWN_MAX_NESTING_DEPTH,
  MARKDOWN_MAX_RENDER_BYTES,
  estimateMarkdownNestingDepth,
  exceedsMarkdownRenderLimits,
} from "@/src/components/ui/markdown-render-limits";

describe("estimateMarkdownNestingDepth", () => {
  it("returns 0 for plain text", () => {
    expect(estimateMarkdownNestingDepth("just a plain sentence")).toBe(0);
    expect(estimateMarkdownNestingDepth("")).toBe(0);
  });

  it("stays low for typical markdown", () => {
    const doc = [
      "# Title",
      "",
      "Some **bold** and _italic_ and `code` text.",
      "",
      "- item one",
      "  - nested item",
      "    - deeper item",
      "",
      "> a short quote",
      "",
      "1. first",
      "2. second",
    ].join("\n");
    expect(estimateMarkdownNestingDepth(doc)).toBeLessThan(
      MARKDOWN_MAX_NESTING_DEPTH,
    );
  });

  it("counts space-separated blockquote nesting exactly", () => {
    expect(estimateMarkdownNestingDepth("> > > hi")).toBeGreaterThanOrEqual(3);
  });

  it("counts tightly-packed blockquote nesting exactly", () => {
    const depth = 500;
    expect(
      estimateMarkdownNestingDepth(">".repeat(depth) + "text"),
    ).toBeGreaterThanOrEqual(depth);
  });

  it("catches long emphasis/strikethrough delimiter runs", () => {
    expect(
      estimateMarkdownNestingDepth("*".repeat(400)),
    ).toBeGreaterThanOrEqual(400);
    expect(
      estimateMarkdownNestingDepth("~".repeat(400)),
    ).toBeGreaterThanOrEqual(400);
  });

  it("catches deeply indented (nested list) content", () => {
    // Each level adds indentation; a 300-level list indents ~600 columns.
    const lines = Array.from(
      { length: 300 },
      (_, i) => "  ".repeat(i) + "- item",
    );
    expect(estimateMarkdownNestingDepth(lines.join("\n"))).toBeGreaterThan(
      MARKDOWN_MAX_NESTING_DEPTH,
    );
  });

  it("does not count mid-line dashes or emphasis as nesting", () => {
    expect(estimateMarkdownNestingDepth("a - b - c - d")).toBe(0);
    expect(estimateMarkdownNestingDepth("use foo_bar_baz names")).toBeLessThan(
      3,
    );
  });
});

describe("exceedsMarkdownRenderLimits", () => {
  it("allows normal content", () => {
    expect(exceedsMarkdownRenderLimits("Hello **world**")).toBe(false);
    expect(exceedsMarkdownRenderLimits("- a\n  - b\n    - c")).toBe(false);
  });

  it("flags content over the size preempt", () => {
    expect(
      exceedsMarkdownRenderLimits("a".repeat(MARKDOWN_MAX_RENDER_BYTES + 1)),
    ).toBe(true);
  });

  it("flags deeply nested content even when small", () => {
    // A few KB of nested blockquotes overflows the parser/renderer in Firefox.
    expect(exceedsMarkdownRenderLimits("> ".repeat(2000) + "boom")).toBe(true);
    expect(exceedsMarkdownRenderLimits("*".repeat(2000))).toBe(true);
  });

  it("does not flag large-but-shallow markdown under the size cap", () => {
    const shallow = "word ".repeat(10_000); // ~50KB, depth 0
    expect(shallow.length).toBeLessThan(MARKDOWN_MAX_RENDER_BYTES);
    expect(exceedsMarkdownRenderLimits(shallow)).toBe(false);
  });
});
