import { containsMarkdown } from "@/src/components/ui/MarkdownViewer";

describe('containsMarkdown Function', () => {
  it('Detects simple bold using asterisks', () => {
    expect(containsMarkdown('This is **bold** text')).toBe(true);
  });

  it('Detects simple italics using asterisks', () => {
    expect(containsMarkdown('This is *italic* text')).toBe(true);
  });

  it('Detects bold using underscores', () => {
    expect(containsMarkdown('This is __bold__ text')).toBe(true);
  });

  it('Detects italics using underscores', () => {
    expect(containsMarkdown('This is _italic_ text')).toBe(true);
  });

  it('Detects inline code with backticks', () => {
    expect(containsMarkdown('This is `code` inline')).toBe(true);
  });

  it('Detects fenced code blocks', () => {
    const codeBlock = "```\nlet x = 10;\n```";
    expect(containsMarkdown(codeBlock)).toBe(true);
  });

  it('Detects headers', () => {
    expect(containsMarkdown('# Header 1')).toBe(true);
    expect(containsMarkdown('## Header 2')).toBe(true);
  });

  it('Detects unordered lists', () => {
    expect(containsMarkdown('- List item 1\n- List item 2')).toBe(true);
  });

  it('Detects ordered lists', () => {
    expect(containsMarkdown('1. First item\n2. Second item')).toBe(true);
  });

  it('Detects blockquotes', () => {
    expect(containsMarkdown('> This is a blockquote')).toBe(true);
  });

  it('Detects links', () => {
    expect(containsMarkdown('[Google](http://www.google.com)')).toBe(true);
  });

  it('Detects images', () => {
    expect(containsMarkdown('![Alt text](http://url/to/img.png)')).toBe(true);
  });

  it('Returns false for non-markdown text', () => {
    expect(containsMarkdown('This is plain text without any markdown syntax')).toBe(false);
    expect(containsMarkdown('12345')).toBe(false);
    expect(containsMarkdown('Simple text.')).toBe(false);
  });

  it('Detects combination of markdown elements', () => {
    const complexMarkdown = "**Bold** and _italic_ and `code`";
    expect(containsMarkdown(complexMarkdown)).toBe(true);
  });
});
