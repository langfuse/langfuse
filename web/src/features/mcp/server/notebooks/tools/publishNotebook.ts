import { z } from "zod";
import {
  notebookDocumentId,
  notebookVersion,
} from "@/src/features/notebooks/schema";
import { publishNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";

const notebookId = notebookDocumentId;

const sourceVersion = notebookVersion
  .optional()
  .describe("Use this published version instead of the staged content.");

export const [publishNotebookTool, handlePublishNotebook] = defineHaloOnlyTool({
  name: "publish_notebook",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.publish_notebook",
  description:
    "Publish the staged notebook as an immutable version. Pass sourceVersion to republish a prior snapshot. Validate the content first.",
  baseSchema: z.object({
    notebookId,
    sourceVersion,
    sourceRevision: notebookVersion
      .optional()
      .describe("Tag this notebook revision instead of the draft head."),
  }),
  handler: async (input, context) => {
    const result = await publishNotebook({
      ...input,
      projectId: context.projectId,
    });
    await auditNotebookMutation(context, result.notebookId, "publish", {
      version: result.version,
    });
    return result;
  },
});
