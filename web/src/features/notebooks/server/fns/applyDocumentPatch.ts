import { assertUnreachable, InvalidRequestError } from "@langfuse/shared";
import { notebookPatchOperationsSchema } from "../../schema";
import { checkInputDepth } from "./checkInputDepth";
import { findNotebookBlock } from "./findNotebookBlock";
import { parseDocument } from "./parseDocument";
import { parseInputBlock } from "./parseInputBlock";
import { serializeDocument } from "./serializeDocument";

export function applyDocumentPatch(jsonl: string, operations: unknown[]) {
  const blocks = parseDocument(jsonl);
  for (const operation of notebookPatchOperationsSchema.parse(operations)) {
    const { op } = operation;
    if (op === "insert") {
      const { block, parentId, beforeId, afterId } = operation;
      checkInputDepth([block]);
      const newBlock = parseInputBlock(block);
      const anchor = beforeId ?? afterId;
      if (parentId) {
        const parent = findNotebookBlock(blocks, parentId)?.block;
        if (parent?.schema !== "row@1")
          throw new InvalidRequestError(`Row block not found: ${parentId}.`);
        parent.props.children.push(newBlock);
      } else if (anchor) {
        const match = findNotebookBlock(blocks, anchor);
        if (!match)
          throw new InvalidRequestError(`Block not found: ${anchor}.`);
        match.siblings.splice(match.index + (afterId ? 1 : 0), 0, newBlock);
      } else {
        blocks.push(newBlock);
      }
    } else if (op === "replace" || op === "remove") {
      const { blockId } = operation;
      const match = findNotebookBlock(blocks, blockId);
      if (!match) throw new InvalidRequestError(`Block not found: ${blockId}.`);
      if (op === "replace") {
        const { block } = operation;
        checkInputDepth([block]);
        match.siblings[match.index] = parseInputBlock({
          ...block,
          id: blockId,
        });
      } else {
        match.siblings.splice(match.index, 1);
      }
    } else {
      return assertUnreachable(op);
    }
    // Subsequent operations address this intermediate tree by ID.
    jsonl = serializeDocument(blocks);
  }
  return { blocks, jsonl };
}
