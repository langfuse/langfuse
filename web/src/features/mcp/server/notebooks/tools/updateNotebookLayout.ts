import { z } from "zod";
import {
  MAX_NOTEBOOK_DOCUMENTS,
  notebookDocumentId,
  notebookDocumentLabel,
  notebookLayoutKind,
  notebookLayoutSchema,
} from "@/src/features/notebooks/schema";
import { updateNotebookLayout } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import type { ServerContext } from "../../../types";
import { auditNotebookMutation } from "../auditNotebookMutation";

export const updateNotebookLayoutSchema = z.object({
  notebookId: notebookDocumentId,
  layout: z
    .strictObject({
      kind: notebookLayoutKind,
      propertySchema: z
        .looseObject({})
        .optional()
        .describe(
          "Versioned property schema: {version: 1, fields: [{id, label, type, options?}], visibleByDefault?}. Table shows every field.",
        ),
      documents: z
        .array(
          z.strictObject({
            documentId: notebookDocumentId,
            title: notebookDocumentLabel.optional(),
            label: notebookDocumentLabel.optional(),
            properties: z.looseObject({}).optional(),
          }),
        )
        .max(MAX_NOTEBOOK_DOCUMENTS)
        .optional(),
    })
    .describe(
      "Replace the notebook's top-level layout instead of writing a body. For Inbox, Tabs, and Table, list the existing document IDs and titles in display order. Each document may provide values keyed by property ID. For Default, omit documents.",
    ),
});

export async function stageNotebookLayout(
  input: z.output<typeof updateNotebookLayoutSchema>,
  context: ServerContext,
) {
  const result = await updateNotebookLayout({
    projectId: context.projectId,
    notebookId: input.notebookId,
    layout: notebookLayoutSchema.parse(input.layout),
  });
  await auditNotebookMutation(context, input.notebookId, "writeDocument");
  return result;
}

export const [updateNotebookLayoutTool, handleUpdateNotebookLayout] =
  defineHaloOnlyTool({
    name: "update_notebook_layout",
    action: "notebooks:CUD",
    spanName: "mcp.notebooks.update_notebook_layout",
    description:
      "Stage a notebook layout change without editing document bodies or publishing. Use get_notebook for existing document IDs. For example, pass layout: {kind: 'tabs', documents: [{documentId: 'main', title: 'Overview'}]}.",
    baseSchema: updateNotebookLayoutSchema,
    destructiveHint: true,
    handler: stageNotebookLayout,
  });
