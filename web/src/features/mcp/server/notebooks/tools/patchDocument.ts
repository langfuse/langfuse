import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MAX_NOTEBOOK_BLOCKS,
  notebookDocumentId,
} from "@/src/features/notebooks/schema";
import { patchDocument } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";
import { getEvidenceLinks } from "../evidenceLinks";
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

const patchSchema = z.object({
  notebookId,
  documentId,
  blockId: notebookDocumentId.optional(),
  removeBlockId: notebookDocumentId.optional(),
  insertBlock: blockDiscoverySchema.optional(),
  replaceBlock: blockDiscoverySchema.optional(),
  parentId: notebookDocumentId.optional(),
  beforeId: notebookDocumentId.optional(),
  afterId: notebookDocumentId.optional(),
});

const compatiblePatchSchema = patchSchema.extend({
  appendMarkdown: z.string().min(1).optional(),
  replaceMarkdown: z.string().min(1).optional(),
  operations: z
    .array(patchOperationDiscoverySchema)
    .min(1)
    .max(MAX_NOTEBOOK_BLOCKS)
    .optional(),
});

export const [patchDocumentTool, handlePatchDocument] = defineHaloOnlyTool<
  z.output<typeof compatiblePatchSchema>,
  "patch_document"
>({
  name: "patch_document",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.patch_document",
  description:
    'Stage one block edit without publishing. Use insertBlock to add any block, blockId with replaceBlock to replace one, or removeBlockId to delete one. For prose, use {"schema":"text@1","markdown":"## Finding"}. insertBlock appends at the root unless you pass one of parentId, beforeId, or afterId. Replacements preserve IDs.',
  baseSchema: patchSchema,
  inputSchema: compatiblePatchSchema.refine(
    ({
      appendMarkdown,
      replaceMarkdown,
      removeBlockId,
      blockId,
      operations,
      insertBlock,
      replaceBlock,
      parentId,
      beforeId,
      afterId,
    }) => {
      const edits = [
        appendMarkdown,
        replaceMarkdown,
        removeBlockId,
        operations,
        insertBlock,
        replaceBlock,
      ];
      const anchors = [parentId, beforeId, afterId].filter(
        (value) => value !== undefined,
      );
      const replacesBlock =
        replaceMarkdown !== undefined || replaceBlock !== undefined;
      return (
        edits.filter((value) => value !== undefined).length === 1 &&
        replacesBlock === (blockId !== undefined) &&
        anchors.length <= (insertBlock === undefined ? 0 : 1)
      );
    },
    {
      message:
        "Choose one edit. Replacement requires blockId; only insertBlock accepts one of parentId, beforeId, or afterId.",
    },
  ),
  destructiveHint: true,
  handler: async (input, context) => {
    const edit =
      input.insertBlock !== undefined
        ? ({
            op: "insert",
            block: {
              ...input.insertBlock,
              id: input.insertBlock.id ?? randomUUID(),
            },
            parentId: input.parentId,
            beforeId: input.beforeId,
            afterId: input.afterId,
          } as const)
        : input.replaceBlock !== undefined
          ? ({
              op: "replace",
              blockId: input.blockId,
              block: input.replaceBlock,
            } as const)
          : input.appendMarkdown !== undefined
            ? ({
                op: "insert",
                block: {
                  id: randomUUID(),
                  schema: "text@1",
                  markdown: input.appendMarkdown,
                },
              } as const)
            : input.replaceMarkdown !== undefined
              ? ({
                  op: "replace",
                  blockId: input.blockId,
                  block: { schema: "text@1", markdown: input.replaceMarkdown },
                } as const)
              : input.removeBlockId !== undefined
                ? ({ op: "remove", blockId: input.removeBlockId } as const)
                : undefined;
    const result = await patchDocument({
      notebookId: input.notebookId,
      documentId: input.documentId,
      operations: input.operations ?? [edit],
      projectId: context.projectId,
      userId: context.userId,
    });
    await auditNotebookMutation(context, input.notebookId, "patchDocument", {
      documentId: result.documentId,
    });
    if (edit) {
      const blockId = edit.op === "insert" ? edit.block.id : edit.blockId;
      return {
        notebookId: result.notebookId,
        documentId: result.documentId,
        revision: result.revision,
        blockId,
        ...(edit.op !== "remove" && { href: `#block-${blockId}` }),
      };
    }
    return { ...result, evidenceLinks: getEvidenceLinks(result.blocks) };
  },
});
