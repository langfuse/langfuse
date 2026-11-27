import { z } from "zod";
import { notebookLayoutKind } from "@/src/features/notebooks/schema";
import { createNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";

const notebookTitleText = z
  .string()
  .max(250)
  .refine((value) => !value.includes("\0"), "NUL characters are not allowed.");

export const [createNotebookTool, handleCreateNotebook] = defineHaloOnlyTool({
  name: "create_notebook",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.create_notebook",
  description:
    "Create an unpublished notebook with a main document. Default shows only main; Inbox and Tabs can hold more documents.",
  baseSchema: z.object({
    title: notebookTitleText.trim().min(1),
    layout: notebookLayoutKind
      .optional()
      .describe("Top-level notebook layout. Defaults to default."),
  }),
  handler: async (input, context) => {
    const result = await createNotebook({
      ...input,
      projectId: context.projectId,
    });
    await auditNotebookMutation(context, result.notebookId, "create");
    return result;
  },
});
