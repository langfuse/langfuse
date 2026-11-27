import type { NotebookBlock, NotebookTextBlockNode } from "./schema";

export const NOTEBOOK_ROW_GAP = 16;
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
    if ("source" in block.props) return 48 + block.props.columns.length * 128;
    const { columns, rows } = block.props;
    return (
      48 +
      columns.reduce((width, label, index) => {
        const characters = rows.reduce(
          (longest, row) =>
            Math.max(longest, String(row.cells[index] ?? "").length),
          label.length,
        );
        return width + Math.min(240, Math.max(72, 24 + characters * 8));
      }, 0)
    );
  }
  if (block.schema === "embed@1") return 640;
  if (block.schema === "button@1") return 160;
  if (block.schema === "chart@1" && block.props.display.kind === "big-number") {
    return 240;
  }
  return 320;
}

export function isInteractiveBlock(block: NotebookBlock): boolean {
  if (block.schema === "row@1") {
    return block.props.children.every(isInteractiveBlock);
  }
  return block.schema !== "text@1";
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
    code: "wide_table" | "long_code_line" | "row_wrap";
    message: string;
  }[] = [];
  const visit = (children: NotebookBlock[]) => {
    for (const block of children) {
      if (block.schema === "row@1") {
        const { children } = block.props;
        const rowWidth = children.every(isInteractiveBlock)
          ? WIDE_PREVIEW_WIDTH
          : availableWidth;
        const requiredWidth = children.reduce(
          (width, child) => width + getNotebookBlockMinimumWidth(child),
          Math.max(0, children.length - 1) * NOTEBOOK_ROW_GAP,
        );
        if (children.length > 1 && requiredWidth > rowWidth) {
          warnings.push({
            blockId: block.id,
            code: "row_wrap",
            message: `This row needs about ${requiredWidth}px to fit side by side and may wrap at ${rowWidth}px. Consider fewer table columns or separate rows if stacking is preferable.`,
          });
        }
        visit(children);
      }
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
