import { z } from "zod";
import {
  notebookDocumentId,
  notebookVersion,
} from "@/src/features/notebooks/schema";
import { validateNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

const sourceVersion = notebookVersion
  .optional()
  .describe("Use this published version instead of the staged content.");

export const [validateNotebookTool, handleValidateNotebook] =
  defineHaloOnlyTool({
    name: "validate_notebook",
    action: "notebooks:read",
    spanName: "mcp.notebooks.validate_notebook",
    readOnlyHint: true,
    description:
      "Validate the staged notebook, including missing or unreachable documents, without changing anything. Pass documentId to check only its body or sourceVersion to validate a published snapshot.",
    baseSchema: z.object({
      notebookId,
      documentId: notebookDocumentId
        .optional()
        .describe(
          "Validate only this document. Omit to validate all documents.",
        ),
      sourceVersion,
    }),
    handler: (input, context) =>
      validateNotebook({ ...input, projectId: context.projectId }),
  });
