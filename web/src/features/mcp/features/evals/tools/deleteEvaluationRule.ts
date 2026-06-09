import {
  DeleteUnstableEvaluationRuleQuery,
  DeleteUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  deletePublicEvaluationRule,
  getPublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteEvaluationRuleTool, handleDeleteEvaluationRule] =
  defineTool({
    name: "deleteEvaluationRule",
    description:
      "Delete an evaluation rule by id. This stops the rule from evaluating new items and cannot be undone.",
    baseSchema: DeleteUnstableEvaluationRuleQuery,
    inputSchema: DeleteUnstableEvaluationRuleQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.delete",
        context,
        attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
        fn: async () => {
          const before = await getPublicEvaluationRule({
            projectId: context.projectId,
            evaluationRuleId: input.evaluationRuleId,
          });

          await deletePublicEvaluationRule({
            projectId: context.projectId,
            evaluationRuleId: input.evaluationRuleId,
          });

          await auditLog({
            action: "delete",
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId: input.evaluationRuleId,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before,
          });

          return DeleteUnstableEvaluationRuleResponse.parse({
            message: "Evaluation rule successfully deleted",
          });
        },
      }),
    destructiveHint: true,
  });
