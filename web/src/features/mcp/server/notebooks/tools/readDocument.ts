import { z } from "zod";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  notebookDocumentId,
  type NotebookBlock,
} from "@/src/features/notebooks/schema";
import { readDocument } from "@/src/features/notebooks/server/notebookService";
import { findNotebookBlock } from "@/src/features/notebooks/server/fns/findNotebookBlock";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

const documentId = notebookDocumentId
  .optional()
  .describe("ID of the document. Defaults to main.");

function outlineBlock(block: NotebookBlock): unknown {
  const entry = { id: block.id, schema: block.schema };
  switch (block.schema) {
    case "row@1":
      return { ...entry, children: block.props.children.map(outlineBlock) };
    case "text@1":
      return {
        ...entry,
        headings: block.content.flatMap((node) =>
          node.type === "heading"
            ? [
                {
                  level: node.attrs.level,
                  text: node.content
                    ?.map((part) => (part.type === "text" ? part.text : ""))
                    .join("")
                    .slice(0, 250),
                },
              ]
            : [],
        ),
      };
    case "chart@1":
      return { ...entry, title: block.props.title };
    case "table@1":
      return "source" in block.props
        ? { ...entry, source: block.props.source.query.schema }
        : { ...entry, rowCount: block.props.rows.length };
    case "embed@1":
      return { ...entry, kind: block.props.target.kind };
    default:
      return entry;
  }
}

const readSchema = z.strictObject({
  notebookId,
  documentId,
  mode: z
    .enum(["full", "outline"])
    .optional()
    .describe(
      "Outline lists headings and block IDs without body content. Defaults to full.",
    ),
  blockId: notebookDocumentId
    .optional()
    .describe("Read only this block, including blocks nested in rows."),
});

export const [readDocumentTool, handleReadDocument] = defineHaloOnlyTool({
  name: "read_document",
  action: "notebooks:read",
  spanName: "mcp.notebooks.read_document",
  readOnlyHint: true,
  description:
    "Read the current document, preferring unpublished changes. Use mode: outline to scan headings and block IDs, or blockId to read just one block.",
  baseSchema: readSchema,
  inputSchema: readSchema.refine(
    ({ mode, blockId }) => mode !== "outline" || blockId === undefined,
    { message: "Choose outline mode or a single blockId." },
  ),
  handler: async (input, context) => {
    const { versions, ...document } = await readDocument({
      ...input,
      projectId: context.projectId,
      preferStaged: true,
    });
    if (input.mode !== "outline" && input.blockId === undefined)
      return document;
    const { notebookId, documentId, revision, version, isDraft, blocks } =
      document;
    const snapshot = { notebookId, documentId, revision, version, isDraft };
    if (input.blockId !== undefined) {
      const match = findNotebookBlock(blocks, input.blockId);
      if (!match)
        throw new LangfuseNotFoundError(`Block not found: ${input.blockId}.`);
      return { ...snapshot, block: match.block };
    }
    return { ...snapshot, outline: blocks.map(outlineBlock) };
  },
});
