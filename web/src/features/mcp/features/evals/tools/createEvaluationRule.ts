import { z } from "zod";
import {
  EvaluationRuleCreateBase,
  PostUnstableEvaluationRuleBody,
  PostUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import { PublicEvaluationRuleTarget } from "@/src/features/public-api/types/unstable-public-evals-contract";
import { createPublicEvaluationRule } from "@/src/features/evals/server/unstable-public-api";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { RuleFilterBaseSchema, RuleMappingBaseSchema } from "../schema";

// Superset (flattened) schema for client discovery. name/evaluator/enabled/
// sampling are reused from the contract's EvaluationRuleCreateBase; only the
// target-discriminated fields are flattened here (target widened to the enum,
// filter/mapping made union-free and target-agnostic). The real per-target
// discriminated union and code-vs-llm mapping rules are enforced at runtime by
// `inputSchema` (PostUnstableEvaluationRuleBody).
const CreateEvaluationRuleBaseSchema = z.object({
  ...EvaluationRuleCreateBase,
  target: PublicEvaluationRuleTarget,
  filter: z
    .array(RuleFilterBaseSchema)
    .optional()
    .describe("Conditions selecting which items the rule runs on."),
  mapping: z
    .array(RuleMappingBaseSchema)
    .optional()
    .describe(
      "Variable mapping. Required for `llm_as_judge` evaluators; omit for `code` evaluators.",
    ),
});

export const [createEvaluationRuleTool, handleCreateEvaluationRule] =
  defineTool({
    name: "createEvaluationRule",
    description: [
      "Create an evaluation rule that runs an evaluator on new observations or experiment items.",
      "Set target to `observation` or `experiment`. For `llm_as_judge` evaluators provide a variable mapping; for `code` evaluators omit mapping (Langfuse manages it).",
    ].join(" "),
    baseSchema: CreateEvaluationRuleBaseSchema,
    inputSchema: PostUnstableEvaluationRuleBody,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.create",
        context,
        attributes: {
          "mcp.evaluation_rule_name": input.name,
          "mcp.evaluation_rule_target": input.target,
        },
        fn: async (span) => {
          const evaluationRule = await createPublicEvaluationRule({
            orgId: context.orgId,
            projectId: context.projectId,
            input,
          });

          span.setAttribute("mcp.evaluation_rule_id", evaluationRule.id);

          await auditLog({
            action: "create",
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId: evaluationRule.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: evaluationRule,
          });

          return PostUnstableEvaluationRuleResponse.parse(evaluationRule);
        },
      }),
    destructiveHint: true,
  });
