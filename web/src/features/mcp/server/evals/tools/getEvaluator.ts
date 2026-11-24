import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { buildEvaluatorUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";
import { EVALUATOR_ID_DESCRIPTION } from "./evaluatorInput";

const GetEvaluatorInput = z.object({
  evaluatorId: z.string().describe(`Required. ${EVALUATOR_ID_DESCRIPTION}`),
});

export const [getEvaluatorTool, handleGetEvaluator] = defineTool({
  name: "getEvaluator",
  description:
    "Fetch a single evaluator by id, including its LLM prompt, code, or decision-model questions and state mapping, plus how many evaluation rules reference it. The latest definition is the entry in `versions`; resend it with updateEvaluator to change the evaluator.",
  action: "evaluator:read",
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
