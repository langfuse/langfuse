import type { NotebookBlock } from "../../schema";

export function findNotebookBlock(
  blocks: NotebookBlock[],
  id: string,
):
  | { siblings: NotebookBlock[]; index: number; block: NotebookBlock }
  | undefined {
  for (const [index, block] of blocks.entries()) {
    if (block.id === id) return { siblings: blocks, index, block };
    if (block.schema === "row@1") {
      const match = findNotebookBlock(block.props.children, id);
      if (match) return match;
    }
  }
}
