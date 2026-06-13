import {
  GetUnstableEvaluatorQuery,
  GetUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import { getPublicEvaluator } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getEvaluatorTool, handleGetEvaluator] = defineTool({
  name: "getEvaluator",
  description:
    "Fetch a single evaluator by id, including its prompt or source code, output definition, and how many evaluation rules reference it.",
  baseSchema: GetUnstableEvaluatorQuery,
  inputSchema: GetUnstableEvaluatorQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.get",
      context,
      attributes: { "mcp.evaluator_id": input.evaluatorId },
      fn: async () => {
        const result = await getPublicEvaluator({
          projectId: context.projectId,
          evaluatorId: input.evaluatorId,
        });

        return GetUnstableEvaluatorResponse.parse(result);
      },
    }),
  readOnlyHint: true,
});
