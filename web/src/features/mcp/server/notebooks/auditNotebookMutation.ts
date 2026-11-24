import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { ServerContext } from "../../types";

export function auditNotebookMutation(
  context: ServerContext,
  notebookId: string,
  action: "create" | "publish" | "writeDocument" | "patchDocument",
  after?: { documentId?: string; version?: number },
) {
  return auditLog({
    apiKeyId: context.apiKeyId,
    orgId: context.orgId,
    projectId: context.projectId,
    resourceType: "notebook",
    resourceId: notebookId,
    action,
    after,
  });
}
