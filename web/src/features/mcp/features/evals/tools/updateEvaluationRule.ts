import { z } from "zod";
import {
  EvaluationRulePatchBase,
  PatchUnstableEvaluationRuleBody,
  PatchUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import { PublicEvaluationRuleTarget } from "@/src/features/public-api/types/unstable-public-evals-contract";
import {
  getPublicEvaluationRule,
  updatePublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { RuleFilterBaseSchema, RuleMappingBaseSchema } from "../schema";

// Superset (flattened) schema for client discovery. name/evaluator/enabled/
// sampling are reused from the contract's EvaluationRulePatchBase (the create
// fields, all optional); only evaluationRuleId and the target-discriminated
// fields are added here. Provide at least one field beyond evaluationRuleId.
// The per-target discriminated union is enforced at runtime via `inputSchema`.
const UpdateEvaluationRuleBaseSchema = z.object({
  evaluationRuleId: z.string(),
  ...EvaluationRulePatchBase,
  target: PublicEvaluationRuleTarget.optional().describe(
    "Provide together with filter/mapping when changing them; must match the rule's target.",
  ),
  filter: z.array(RuleFilterBaseSchema).optional(),
  mapping: z.array(RuleMappingBaseSchema).optional(),
});

// evaluationRuleId addresses the rule; the rest is validated as a PATCH body.
const UpdateEvaluationRuleInputSchema = z.intersection(
  z.object({ evaluationRuleId: z.string() }),
  PatchUnstableEvaluationRuleBody,
);

export const [updateEvaluationRuleTool, handleUpdateEvaluationRule] =
  defineTool({
    name: "updateEvaluationRule",
    description: [
      "Update an existing evaluation rule. Provide evaluationRuleId plus at least one field to change.",
      "When updating filter or mapping, also pass the matching target. The evaluator type cannot be changed.",
    ].join(" "),
    baseSchema: UpdateEvaluationRuleBaseSchema,
    inputSchema: UpdateEvaluationRuleInputSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.update",
        context,
        attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
        fn: async () => {
          const { evaluationRuleId, ...patch } = input;

          const before = await getPublicEvaluationRule({
            projectId: context.projectId,
            evaluationRuleId,
          });

          const evaluationRule = await updatePublicEvaluationRule({
            orgId: context.orgId,
            projectId: context.projectId,
            evaluationRuleId,
            input: patch,
          });

          await auditLog({
            action: "update",
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId: evaluationRule.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before,
            after: evaluationRule,
          });

          return PatchUnstableEvaluationRuleResponse.parse(evaluationRule);
        },
      }),
    destructiveHint: true,
  });
