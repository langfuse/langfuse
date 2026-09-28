import { isMap, isNode, parseDocument } from "yaml";

export function resetSkillName(markdown: string, name: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
  if (!match) return `---\nname: ${name}\n---\n${markdown}`;

  const frontmatter = match[2]!;
  const document = parseDocument(frontmatter);
  const nameNode = isMap(document.contents)
    ? document.get("name", true)
    : undefined;
  if (isNode(nameNode) && nameNode.range) {
    const start = match[1]!.length + nameNode.range[0];
    const end = match[1]!.length + nameNode.range[1];
    const trailingNewline =
      /\r?\n$/.exec(markdown.slice(start, end))?.[0] ?? "";
    return (
      markdown.slice(0, start) + name + trailingNewline + markdown.slice(end)
    );
  }

  const newline = match[1]!.endsWith("\r\n") ? "\r\n" : "\n";
  const start = match[1]!.length;
  return (
    markdown.slice(0, start) + `name: ${name}${newline}` + markdown.slice(start)
  );
}
