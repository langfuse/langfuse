import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";
import { getNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

export const [getNotebookTool, handleGetNotebook] = defineHaloOnlyTool({
  name: "get_notebook",
  action: "notebooks:read",
  spanName: "mcp.notebooks.get_notebook",
  readOnlyHint: true,
  description:
    "Get notebook metadata and the current document index and layout. Unpublished changes take precedence over the latest publication.",
  baseSchema: z.strictObject({ notebookId }),
  handler: async (input, context) => {
    const { versions, revisions, ...notebook } = await getNotebook({
      ...input,
      projectId: context.projectId,
      preferStaged: true,
    });
    return notebook;
  },
});
