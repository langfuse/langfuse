import { InvalidRequestError } from "@langfuse/shared";
import { checkInputDepth } from "./checkInputDepth";
import { parseInputBlock } from "./parseInputBlock";
import { parseJsonl } from "./parseJsonl";
import { serializeDocument } from "./serializeDocument";

export function encodeDocument(input: {
  markdown?: string;
  blocks?: unknown[];
  jsonl?: string;
}) {
  const sources = [input.markdown, input.blocks, input.jsonl].filter(
    (value) => value !== undefined,
  );
  if (sources.length !== 1)
    throw new InvalidRequestError(
      "Provide exactly one of markdown, blocks, or jsonl.",
    );
  const values =
    input.markdown !== undefined
      ? [{ schema: "text@1", markdown: input.markdown }]
      : (input.blocks ?? parseJsonl(input.jsonl ?? ""));
  checkInputDepth(values);
  const blocks = values.map(parseInputBlock);
  return { blocks, jsonl: serializeDocument(blocks) };
}
