import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";
import { publishNotebook } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";
import { auditNotebookMutation } from "../auditNotebookMutation";

const notebookId = notebookDocumentId;

export const [publishNotebookTool, handlePublishNotebook] = defineHaloOnlyTool({
  name: "publish_notebook",
  action: "notebooks:CUD",
  spanName: "mcp.notebooks.publish_notebook",
  description:
    "Publish the current draft as an immutable version. Pass the fingerprint from whole-notebook validation to publish exactly the validated draft.",
  baseSchema: z.strictObject({
    notebookId,
    expectedSnapshotFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe(
        "Fingerprint from validate_notebook. Reject publishing if the snapshot changed.",
      ),
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
