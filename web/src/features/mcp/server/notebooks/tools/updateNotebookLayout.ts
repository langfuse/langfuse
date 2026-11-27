import { z } from "zod";
import {
  MAX_NOTEBOOK_DOCUMENTS,
  notebookDocumentId,
  notebookDocumentLabel,
  notebookLayoutKind,
  notebookDocumentWidth,
  notebookLayoutSchema,
  notebookWiringSchema,
} from "@/src/features/notebooks/schema";
import { updateNotebookLayout } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import type { ServerContext } from "../../../types";
import { auditNotebookMutation } from "../auditNotebookMutation";

export const updateNotebookLayoutSchema = z.object({
  notebookId: notebookDocumentId,
  variables: notebookWiringSchema.shape.variables.describe(
    "Replace the revision’s variables. Omit to keep them; pass [] to clear them.",
  ),
  bindings: notebookWiringSchema.shape.bindings.describe(
    "Replace the revision’s bindings. Omit to keep them; pass [] to clear them.",
  ),
  layout: z
    .strictObject({
      kind: notebookLayoutKind,
      width: notebookDocumentWidth
        .optional()
        .describe("Notebook width for Default or Tabs. Omit for Inbox."),
      variables: notebookWiringSchema.shape.variables,
      bindings: notebookWiringSchema.shape.bindings,
      propertySchema: z
        .looseObject({})
        .optional()
        .describe(
          "Versioned property schema: {version: 1, fields: [{id, label, type, options?}], visibleByDefault?}.",
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
    .optional()
    .describe(
      "Replace the notebook's top-level layout instead of writing a body. For Inbox and Tabs, list the existing document IDs and titles in display order. Each document may provide values keyed by property ID. For Default, omit documents.",
    ),
});

export async function stageNotebookLayout(
  input: z.output<typeof updateNotebookLayoutSchema>,
  context: ServerContext,
) {
  const result = await updateNotebookLayout({
    projectId: context.projectId,
    userId: context.userId,
    notebookId: input.notebookId,
    layout: input.layout && notebookLayoutSchema.parse(input.layout),
    variables: input.variables,
    bindings: input.bindings,
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
      "Stage any of layout, variables, or bindings independently. Omitted fields stay unchanged. This operates without editing document bodies or publishing. A table@1 exposes a string 'selection' output with its row IDs or configured live selection field. A chart@1 exposes a dateRange 'timeRange' input and a string 'filter' input if bindFilter identifies a string equality filter. An embed@1 exposes a string 'resourceId' input that overrides its fixed target ID. A trace embed also exposes a string 'observationId' input that opens the parent trace with that observation focused. Bindings reference document, element and port IDs. Run validate_notebook before publishing.",
    baseSchema: updateNotebookLayoutSchema,
    destructiveHint: true,
    handler: stageNotebookLayout,
  });
