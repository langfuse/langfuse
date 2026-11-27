import type { NotebookBlock, NotebookTextBlockNode } from "./schema";

const TABLE_COLUMN_WIDTH = 128;
// Validation has no browser viewport, so these are reference content widths.
const CONTAINED_READING_WIDTH = 848;
const WIDE_PREVIEW_WIDTH = 960;

export function getNotebookBlockMinimumWidth(block: NotebookBlock): number {
  if (block.schema === "row@1") {
    return Math.max(
      0,
      ...block.props.children.map(getNotebookBlockMinimumWidth),
    );
  }
  if (block.schema === "table@1") {
    return block.props.columns.length * TABLE_COLUMN_WIDTH;
  }
  if (block.schema === "embed@1") return 640;
  if (block.schema === "button@1") return 160;
  if (block.schema === "chart@1" && block.props.display.kind === "big-number") {
    return 240;
  }
  return 320;
}

function longestCodeLine(nodes: NotebookTextBlockNode[]): number {
  let longest = 0;
  for (const node of nodes) {
    if (node.type === "code_block") {
      for (const line of (node.content ?? [])
        .map(({ text }) => text)
        .join("")
        .split("\n")) {
        longest = Math.max(longest, line.replaceAll("\t", "    ").length);
      }
    } else if (node.type === "blockquote") {
      longest = Math.max(longest, longestCodeLine(node.content));
    } else if (node.type === "ordered_list" || node.type === "bullet_list") {
      for (const item of node.content) {
        longest = Math.max(longest, longestCodeLine(item.content));
      }
    }
  }
  return longest;
}

export function getNotebookPresentationWarnings(
  blocks: NotebookBlock[],
  wide: boolean,
) {
  const availableWidth = wide ? WIDE_PREVIEW_WIDTH : CONTAINED_READING_WIDTH;
  const warnings: {
    blockId: string;
    code: "wide_table" | "long_code_line";
    message: string;
  }[] = [];
  const visit = (children: NotebookBlock[]) => {
    for (const block of children) {
      if (block.schema === "row@1") visit(block.props.children);
      if (
        block.schema === "table@1" &&
        getNotebookBlockMinimumWidth(block) > availableWidth
      ) {
        warnings.push({
          blockId: block.id,
          code: "wide_table",
          message:
            "This table may need horizontal scrolling even on its own line. Consider showing fewer columns.",
        });
      }
      if (
        block.schema === "text@1" &&
        longestCodeLine(block.content) * 8 + 32 > availableWidth
      ) {
        warnings.push({
          blockId: block.id,
          code: "long_code_line",
          message:
            "A long code line may need horizontal scrolling. Consider breaking it into shorter lines.",
        });
      }
    }
  };
  visit(blocks);
  return warnings;
}
