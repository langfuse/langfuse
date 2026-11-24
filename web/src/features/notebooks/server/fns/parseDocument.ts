import { type NotebookBlock } from "../../schema";
import { checkInputDepth } from "./checkInputDepth";
import { parseJsonl } from "./parseJsonl";
import { parseStoredBlock } from "./parseStoredBlock";
import { serializeDocument } from "./serializeDocument";

export function parseDocument(
  jsonl: string,
  mode: "stored" | "validate" = "stored",
): NotebookBlock[] {
  const values = parseJsonl(jsonl);
  checkInputDepth(values);
  const blocks = values.map((value) => parseStoredBlock(value, mode));
  serializeDocument(blocks);
  return blocks;
}
