import { randomUUID } from "node:crypto";
import { assertUnreachable, InvalidRequestError } from "@langfuse/shared";
import type { z } from "zod";
import {
  type NotebookBlock,
  type notebookInputBlockSchema,
  MAX_NOTEBOOK_DOCUMENT_BYTES,
  MAX_NOTEBOOK_NESTING,
} from "../../schema";
import { markdownToContent } from "./markdownToContent";
import { hasMarkdownTable, markdownTableError } from "./findMarkdownTable";

export function normalizeBlock(
  block: z.output<typeof notebookInputBlockSchema>,
): NotebookBlock {
  const id = block.id ?? randomUUID();
  if (block.schema === "text@1") {
    const content =
      block.source === "markdown"
        ? markdownToContent(block.markdown, {
            maxBytes: MAX_NOTEBOOK_DOCUMENT_BYTES,
            maxNesting: MAX_NOTEBOOK_NESTING,
          })
        : block.content;
    if (block.source === "markdown" && hasMarkdownTable(content))
      throw new InvalidRequestError(`Block ${id}: ${markdownTableError}`);
    return { id, schema: block.schema, props: block.props ?? {}, content };
  }
  if (block.schema === "row@1") {
    return {
      id,
      schema: block.schema,
      props: {
        ...block.props,
        children: block.props.children.map(normalizeBlock),
      },
    };
  }
  if (
    block.schema === "chart@1" ||
    block.schema === "table@1" ||
    block.schema === "embed@1" ||
    block.schema === "button@1"
  )
    return { ...block, id };
  return assertUnreachable(block);
}
