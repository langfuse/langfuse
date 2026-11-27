import { type NotebookBlock, notebookInputBlockSchema } from "../../schema";
import { normalizeBlock } from "./normalizeBlock";
import { parseStoredBlock } from "./parseStoredBlock";

export function parseInputBlock(value: unknown): NotebookBlock {
  return parseStoredBlock(
    normalizeBlock(notebookInputBlockSchema.parse(value)),
    "validate",
  );
}
