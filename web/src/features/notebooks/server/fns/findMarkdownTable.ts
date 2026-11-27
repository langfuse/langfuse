import type { NotebookTextNode } from "../../schema";

export const markdownTableError =
  "Markdown pipe tables do not render in text blocks. Use a table@1 block for the table and keep surrounding prose in text@1.";

export function hasMarkdownTable(nodes: readonly NotebookTextNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === "paragraph") {
      const text = node.content
        ?.map((part) => {
          if (part.type === "hard_break") return "\n";
          if (part.type !== "text") return "";
          return part.marks?.some(({ type }) => type === "code")
            ? "code"
            : part.text;
        })
        .join("");
      return (
        /\|[^\n]*\|[^\S\n]*(?:\r?\n[^\S\n]*)?\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?/m.test(
          text ?? "",
        ) ||
        /(?:^|\n)[^\n]*\|[^\n]*\r?\n[ \t]*:?-{3,}:?[ \t]*\|[ \t]*:?-{3,}:?/m.test(
          text ?? "",
        )
      );
    }
    if (
      node.type === "blockquote" ||
      node.type === "bullet_list" ||
      node.type === "ordered_list" ||
      node.type === "list_item"
    )
      return hasMarkdownTable(node.content);
    return false;
  });
}
