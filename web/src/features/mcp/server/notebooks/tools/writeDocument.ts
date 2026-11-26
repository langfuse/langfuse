import { z } from "zod";
import {
  MAX_NOTEBOOK_BLOCKS,
  MAX_NOTEBOOK_DOCUMENT_BYTES,
  notebookDocumentId,
  notebookDocumentLabel,
} from "@/src/features/notebooks/schema";
import { writeDocument } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";
import { getEvidenceLinks } from "../evidenceLinks";
import { blockDiscoverySchema } from "../schema";

import {
  stageNotebookLayout,
  updateNotebookLayoutSchema,
} from "./updateNotebookLayout";

const notebookId = notebookDocumentId;

const writeDocumentSchema = z.object({
  notebookId,
  documentId: notebookDocumentId
    .optional()
    .describe(
      "Existing document to replace. Body writes default to main when neither documentId nor label is set.",
    ),
  label: notebookDocumentLabel
    .optional()
    .describe(
      "Add a new document to Inbox or Tabs with this title. Omit documentId.",
    ),
  ...updateNotebookLayoutSchema.omit({ notebookId: true }).partial().shape,
  markdown: z
    .string()
    .max(MAX_NOTEBOOK_DOCUMENT_BYTES)
    .optional()
    .describe("Document body as Markdown."),
  blocks: z
    .array(blockDiscoverySchema)
    .max(MAX_NOTEBOOK_BLOCKS)
    .optional()
    .describe("Document body as an array of notebook blocks."),
  jsonl: z
    .string()
    .max(MAX_NOTEBOOK_DOCUMENT_BYTES)
    .optional()
    .describe("Document body as JSON Lines, one notebook block per line."),
});

export const [writeDocumentTool, handleWriteDocument] = defineHaloOnlyTool({
  name: "write_document",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.write_document",
  description:
    "Stage a notebook document without publishing. Pass notebookId and exactly one of markdown, blocks, or jsonl. Omit documentId and label to replace main, pass documentId to replace another document, or pass label to add a document to Inbox or Tabs.",
  baseSchema: writeDocumentSchema,
  inputSchema: writeDocumentSchema.superRefine((input, ctx) => {
    const bodyCount = [input.markdown, input.blocks, input.jsonl].filter(
      (value) => value !== undefined,
    ).length;
    if (input.layout) {
      if (bodyCount || input.documentId || input.label) {
        ctx.addIssue({
          code: "custom",
          message: "A layout update cannot also edit a document.",
        });
      }
      return;
    }
    if (bodyCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Pass exactly one of markdown, blocks or jsonl.",
      });
    }
    if (input.documentId !== undefined && input.label !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "Pass documentId to replace an existing document or label to add one, not both. Omit both to replace main.",
      });
    }
  }),
  destructiveHint: true,
  handler: async (input, context) => {
    if (input.layout) {
      return stageNotebookLayout({ ...input, layout: input.layout }, context);
    }
    const result = await writeDocument({
      ...input,
      documentId:
        input.documentId ?? (input.label === undefined ? "main" : undefined),
      projectId: context.projectId,
      userId: context.userId,
    });
    await auditNotebookMutation(context, input.notebookId, "writeDocument", {
      documentId: result.documentId,
    });
    return { ...result, evidenceLinks: getEvidenceLinks(result.blocks) };
  },
});
