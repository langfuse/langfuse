import { z } from "zod";
import {
  notebookDocumentId,
  notebookVersion,
} from "@/src/features/notebooks/schema";
import { getNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

export const [getNotebookTool, handleGetNotebook] = defineHaloOnlyTool({
  name: "get_notebook",
  action: "notebooks:read",
  spanName: "mcp.notebooks.get_notebook",
  readOnlyHint: true,
  description:
    "Get notebook metadata, the document index for the requested or latest published version, and live draft status. Unpublished notebooks return a staged index and no version.",
  baseSchema: z.object({ notebookId, version: notebookVersion.optional() }),
  handler: (input, context) =>
    getNotebook({ ...input, projectId: context.projectId }),
});
