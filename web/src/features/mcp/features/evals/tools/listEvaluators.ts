import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { buildEvaluatorUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";

const ListEvaluatorsInput = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export const [listEvaluatorsTool, handleListEvaluators] = defineTool({
  name: "listEvaluators",
  description:
    "List evaluators (llm_as_judge and code) defined in the current Langfuse project. Results are paginated.",
  baseSchema: ListEvaluatorsInput,
  inputSchema: ListEvaluatorsInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const { evaluators, totalItems } = await createMcpEvaluatorService(
          context,
        ).list({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });
        const data = evaluators.map((evaluator) => ({
          ...evaluator,
          url: buildEvaluatorUrl({
            projectId: context.projectId,
            evaluatorId: evaluator.id,
          }),
        }));
        return {
          data,
          meta: {
            page: input.page,
            limit: input.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / input.limit),
          },
        };
      },
    }),
  readOnlyHint: true,
});
