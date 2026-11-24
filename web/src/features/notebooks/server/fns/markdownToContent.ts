import { fromMarkdown } from "mdast-util-from-markdown";
import { InvalidRequestError } from "@langfuse/shared";
import type { NotebookTextBlockNode, NotebookTextMark } from "../../schema";

type MarkdownNode = ReturnType<typeof fromMarkdown>["children"][number];
type MarkdownDefinition = Extract<MarkdownNode, { type: "definition" }>;
type MarkdownInline = Extract<
  MarkdownNode,
  { type: "paragraph" }
>["children"][number];
type InlineNode = NonNullable<
  Extract<NotebookTextBlockNode, { type: "paragraph" }>["content"]
>[number];

export function markdownToContent(
  markdown: string,
  { maxBytes, maxNesting }: { maxBytes: number; maxNesting: number },
): NotebookTextBlockNode[] {
  if (Buffer.byteLength(markdown) > maxBytes) {
    throw new InvalidRequestError("Markdown exceeds the document size limit.");
  }
  const root = fromMarkdown(markdown);
  const definitions = new Map<string, MarkdownDefinition>();
  const pending: { node: typeof root | MarkdownNode; depth: number }[] = [
    { node: root, depth: 0 },
  ];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > maxNesting)
      throw new InvalidRequestError("Markdown is nested too deeply.");
    if (node.type === "definition" && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
    if (node.type === "root" || node.type === "blockquote") {
      for (const child of [...node.children].reverse())
        pending.push({ node: child, depth: depth + 1 });
    } else if (node.type === "list") {
      for (const child of node.children
        .flatMap((item) => item.children)
        .reverse()) {
        pending.push({ node: child, depth: depth + 2 });
      }
    }
  }

  function inline(
    node: MarkdownInline,
    marks: NotebookTextMark[] = [],
    depth = 0,
  ): InlineNode[] {
    if (depth > maxNesting)
      throw new InvalidRequestError("Markdown is nested too deeply.");
    const text = (value: string, extraMarks = marks): InlineNode[] =>
      value
        ? [
            {
              type: "text",
              text: value,
              ...(extraMarks.length ? { marks: extraMarks } : {}),
            },
          ]
        : [];
    const children = (nodes: MarkdownInline[], mark: NotebookTextMark) =>
      nodes.flatMap((child) => inline(child, [...marks, mark], depth + 1));
    if (node.type === "text" || node.type === "html") return text(node.value);
    if (node.type === "inlineCode") {
      return text(node.value, [...marks, { type: "code" }]);
    }
    if (node.type === "strong") {
      return children(node.children, { type: "strong" });
    }
    if (node.type === "emphasis") {
      return children(node.children, { type: "em" });
    }
    if (node.type === "link" || node.type === "linkReference") {
      const target =
        node.type === "link" ? node : definitions.get(node.identifier);
      return target
        ? children(node.children, {
            type: "link",
            attrs: { href: target.url, title: target.title ?? null },
          })
        : node.children.flatMap((child) => inline(child, marks, depth + 1));
    }
    if (node.type === "break") return [{ type: "hard_break" }];
    if (node.type === "image" || node.type === "imageReference") {
      const target =
        node.type === "image" ? node : definitions.get(node.identifier);
      return target
        ? [
            {
              type: "image",
              attrs: {
                src: target.url,
                alt: node.alt ?? null,
                title: target.title ?? null,
              },
            },
          ]
        : text(node.alt ?? "");
    }
    throw new InvalidRequestError("Unsupported inline Markdown node.");
  }

  function block(node: MarkdownNode): NotebookTextBlockNode[] {
    if (node.type === "paragraph") {
      return [
        {
          type: "paragraph",
          content: node.children.flatMap((child) => inline(child)),
        },
      ];
    }
    if (node.type === "heading") {
      return [
        {
          type: "heading",
          attrs: { level: node.depth },
          content: node.children.flatMap((child) => inline(child)),
        },
      ];
    }
    if (node.type === "code") {
      return [
        {
          type: "code_block",
          content: node.value ? [{ type: "text", text: node.value }] : [],
        },
      ];
    }
    if (node.type === "html") {
      return [
        { type: "paragraph", content: [{ type: "text", text: node.value }] },
      ];
    }
    if (node.type === "thematicBreak") return [{ type: "horizontal_rule" }];
    if (node.type === "blockquote") {
      const content = node.children.flatMap(block);
      return [
        {
          type: "blockquote",
          content: content.length ? content : [{ type: "paragraph" }],
        },
      ];
    }
    if (node.type === "list") {
      const content = node.children.map(
        (
          item,
        ): Extract<
          NotebookTextBlockNode,
          { type: "bullet_list" }
        >["content"][number] => {
          const [first, ...rest] = item.children.flatMap(block);
          return {
            type: "list_item",
            content:
              first?.type === "paragraph"
                ? [first, ...rest]
                : [{ type: "paragraph" }, ...(first ? [first, ...rest] : [])],
          };
        },
      );
      return node.ordered
        ? [
            {
              type: "ordered_list",
              attrs: { order: node.start ?? 1 },
              content,
            },
          ]
        : [{ type: "bullet_list", content }];
    }
    if (node.type === "definition") return [];
    throw new InvalidRequestError("Unsupported Markdown block.");
  }

  return root.children.flatMap(block);
}
