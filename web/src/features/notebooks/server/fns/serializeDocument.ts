import { InvalidRequestError } from "@langfuse/shared";
import {
  type NotebookBlock,
  MAX_NOTEBOOK_BLOCKS,
  MAX_NOTEBOOK_DOCUMENT_BYTES,
} from "../../schema";
import { checkInputDepth } from "./checkInputDepth";

export function serializeDocument(blocks: NotebookBlock[]): string {
  const ids = new Set<string>();
  const visit = (children: NotebookBlock[]) => {
    for (const block of children) {
      if (ids.has(block.id))
        throw new InvalidRequestError(`Duplicate block ID: ${block.id}.`);
      ids.add(block.id);
      if (ids.size > MAX_NOTEBOOK_BLOCKS)
        throw new InvalidRequestError(
          `A document can have at most ${MAX_NOTEBOOK_BLOCKS} blocks.`,
        );
      if (block.schema === "row@1") visit(block.props.children);
    }
  };
  checkInputDepth(blocks);
  visit(blocks);
  const jsonl = blocks.map((block) => JSON.stringify(block)).join("\n");
  if (Buffer.byteLength(jsonl) > MAX_NOTEBOOK_DOCUMENT_BYTES) {
    throw new InvalidRequestError("Document exceeds the size limit.");
  }
  return jsonl;
}
