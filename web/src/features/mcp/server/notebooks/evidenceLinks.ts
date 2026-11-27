import type { NotebookBlock } from "@/src/features/notebooks/schema";

export function getEvidenceLinks(
  blocks: readonly NotebookBlock[],
): { blockId: string; schema: NotebookBlock["schema"]; href: string }[] {
  return blocks.flatMap((block) => {
    const link = {
      blockId: block.id,
      schema: block.schema,
      href: `#block-${block.id}`,
    };
    switch (block.schema) {
      case "row@1": {
        const children = getEvidenceLinks(block.props.children);
        return children.length ? [link, ...children] : [];
      }
      case "table@1":
      case "chart@1":
      case "embed@1":
        return [link];
      default:
        return [];
    }
  });
}
