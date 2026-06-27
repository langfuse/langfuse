import {
  GetUnstableEvaluatorsQuery,
  GetUnstableEvaluatorsResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import { listPublicEvaluators } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { buildEvaluatorUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listEvaluatorsTool, handleListEvaluators] = defineTool({
  name: "listEvaluators",
  description:
    "List evaluators (llm_as_judge and code) defined in the current Langfuse project. Results are paginated.",
  baseSchema: GetUnstableEvaluatorsQuery,
  inputSchema: GetUnstableEvaluatorsQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listPublicEvaluators({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        const parsed = GetUnstableEvaluatorsResponse.parse(result);

        return {
          ...parsed,
          data: parsed.data.map((evaluator) => ({
            ...evaluator,
            url: buildEvaluatorUrl({
              projectId: context.projectId,
              evaluatorId: evaluator.id,
            }),
          })),
        };
      },
    }),
  readOnlyHint: true,
});
