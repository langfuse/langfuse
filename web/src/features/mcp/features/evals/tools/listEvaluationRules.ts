import {
  GetUnstableEvaluationRulesQuery,
  GetUnstableEvaluationRulesResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import { listPublicEvaluationRules } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listEvaluationRulesTool, handleListEvaluationRules] = defineTool({
  name: "listEvaluationRules",
  description:
    "List evaluation rules in the current Langfuse project. Each rule attaches an evaluator to incoming observations or experiment items. Results are paginated.",
  baseSchema: GetUnstableEvaluationRulesQuery,
  inputSchema: GetUnstableEvaluationRulesQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listPublicEvaluationRules({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        return GetUnstableEvaluationRulesResponse.parse(result);
      },
    }),
  readOnlyHint: true,
});
