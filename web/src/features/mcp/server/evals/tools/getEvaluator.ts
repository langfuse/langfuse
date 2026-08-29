import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { buildEvaluatorUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";

const GetEvaluatorInput = z.object({ evaluatorId: z.string() });

export const [getEvaluatorTool, handleGetEvaluator] = defineTool({
  name: "getEvaluator",
  description:
    "Fetch a single evaluator by id, including its prompt or source code, output definition, and how many evaluation rules reference it.",
  baseSchema: GetEvaluatorInput,
  inputSchema: GetEvaluatorInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.get",
      context,
      attributes: { "mcp.evaluator_id": input.evaluatorId },
      fn: async () => {
        const evaluator = await createMcpEvaluatorService(context).get(
          context.projectId,
          input.evaluatorId,
        );

        return {
          ...evaluator,
          url: buildEvaluatorUrl({
            projectId: context.projectId,
            evaluatorId: evaluator.id,
          }),
        };
      },
    }),
  readOnlyHint: true,
});
