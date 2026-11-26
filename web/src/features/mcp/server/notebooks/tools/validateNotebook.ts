import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";
import { validateNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

export const [validateNotebookTool, handleValidateNotebook] =
  defineHaloOnlyTool({
    name: "validate_notebook",
    action: "notebooks:read",
    spanName: "mcp.notebooks.validate_notebook",
    readOnlyHint: true,
    description:
      "Validate the current draft without changing it. Omit documentId to validate the whole notebook and obtain the fingerprint required to publish.",
    baseSchema: z.strictObject({
      notebookId,
      documentId: notebookDocumentId.optional(),
    }),
    handler: (input, context) =>
      validateNotebook({ ...input, projectId: context.projectId }),
  });
