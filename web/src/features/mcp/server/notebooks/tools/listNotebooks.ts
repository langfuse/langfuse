import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";
import { listNotebooks } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

const notebookTitleText = z
  .string()
  .max(250)
  .refine((value) => !value.includes("\0"), "NUL characters are not allowed.");

const listNotebooksSchema = z.object({
  search: notebookTitleText.optional().describe("Search notebooks by title."),
  cursor: notebookId.optional().describe("Cursor from the previous page."),
});

export const [listNotebooksTool, handleListNotebooks] = defineHaloOnlyTool({
  name: "list_notebooks",
  action: "notebooks:read",
  spanName: "mcp.notebooks.list_notebooks",
  readOnlyHint: true,
  description: "List notebooks in the authenticated project.",
  baseSchema: listNotebooksSchema,
  inputSchema: listNotebooksSchema.default({}),
  handler: (input, context) =>
    listNotebooks({ ...input, projectId: context.projectId }),
});
