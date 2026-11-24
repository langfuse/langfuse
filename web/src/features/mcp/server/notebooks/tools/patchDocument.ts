import { z } from "zod";
import {
  MAX_NOTEBOOK_BLOCKS,
  notebookDocumentId,
} from "@/src/features/notebooks/schema";
import { patchDocument } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";
import { blockDiscoverySchema } from "../schema";

const notebookId = notebookDocumentId;

const documentId = notebookDocumentId
  .optional()
  .describe("ID of the document. Defaults to main.");

const patchOperationDiscoverySchema = z.strictObject({
  op: z.enum(["insert", "replace", "remove"]),
  blockId: notebookDocumentId.optional(),
  parentId: notebookDocumentId.optional(),
  beforeId: notebookDocumentId
    .optional()
    .describe("Insert before this sibling. Omit afterId."),
  afterId: notebookDocumentId
    .optional()
    .describe("Insert after this sibling. Omit beforeId."),
  block: blockDiscoverySchema.optional(),
});

export const [patchDocumentTool, handlePatchDocument] = defineHaloOnlyTool({
  name: "patch_document",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.patch_document",
  description:
    'Stage ordered edits without publishing. Use read_document with staged: true to find block IDs. Insert: {"op":"insert","block":{"schema":"text@1","markdown":"## Summary"}}. Append at the root by default, or pass just one of parentId (append to a row), beforeId, or afterId. Replace: {"op":"replace","blockId":"summary","block":{"schema":"text@1","markdown":"Updated summary"}}. Remove: {"op":"remove","blockId":"summary"}. Replacements keep the original ID.',
  baseSchema: z.object({
    notebookId,
    documentId,
    operations: z
      .array(patchOperationDiscoverySchema)
      .min(1)
      .max(MAX_NOTEBOOK_BLOCKS),
  }),
  destructiveHint: true,
  handler: async (input, context) => {
    const result = await patchDocument({
      ...input,
      projectId: context.projectId,
      runKey: context.apiKeyId,
    });
    await auditNotebookMutation(context, input.notebookId, "patchDocument", {
      documentId: result.documentId,
    });
    return result;
  },
});
