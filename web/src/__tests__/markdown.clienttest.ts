import { containsAnyMarkdown } from "@/src/components/schemas/MarkdownSchema";

describe("containsAnyMarkdown Function", () => {
  it("Detects simple bold using asterisks", () => {
    expect(containsAnyMarkdown("This is **bold** text")).toBe(true);
  });

  it("Detects simple italics using asterisks", () => {
    expect(containsAnyMarkdown("This is *italic* text")).toBe(true);
  });

  it("Detects bold using underscores", () => {
    expect(containsAnyMarkdown("This is __bold__ text")).toBe(true);
  });

  it("Detects italics using underscores", () => {
    expect(containsAnyMarkdown("This is _italic_ text")).toBe(true);
  });

  it("Detects inline code with backticks", () => {
    expect(containsAnyMarkdown("This is `code` inline")).toBe(true);
  });

  it("Detects fenced code blocks", () => {
    const codeBlock = "```\nlet x = 10;\n```";
    expect(containsAnyMarkdown(codeBlock)).toBe(true);
  });

  it("Detects headers", () => {
    expect(containsAnyMarkdown("# Header 1")).toBe(true);
    expect(containsAnyMarkdown("## Header 2")).toBe(true);
  });

  it("Detects unordered lists", () => {
    expect(containsAnyMarkdown("- List item 1\n- List item 2")).toBe(true);
  });

  it("Detects ordered lists", () => {
    expect(containsAnyMarkdown("1. First item\n2. Second item")).toBe(true);
  });

  it("Detects blockquotes", () => {
    expect(containsAnyMarkdown("> This is a blockquote")).toBe(true);
  });

  it("Detects links", () => {
    expect(containsAnyMarkdown("[Google](http://www.google.com)")).toBe(true);
  });

  it("Detects images", () => {
    expect(containsAnyMarkdown("![Alt text](http://url/to/img.png)")).toBe(
      true,
    );
  });

  it("Returns false for non-markdown text", () => {
    expect(
      containsAnyMarkdown("This is plain text without any markdown syntax"),
    ).toBe(false);
    expect(containsAnyMarkdown("12345")).toBe(false);
    expect(containsAnyMarkdown("Simple text.")).toBe(false);
  });

  it("Detects combination of markdown elements", () => {
    const complexMarkdown = "**Bold** and _italic_ and `code`";
    expect(containsAnyMarkdown(complexMarkdown)).toBe(true);
  });
});
