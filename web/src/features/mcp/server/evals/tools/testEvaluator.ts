import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";
import {
  McpEvaluatorDefinitionInputBase,
  McpEvaluatorInput,
  toEvaluatorServiceInput,
} from "./evaluatorInput";

const DraftEvaluatorFields = McpEvaluatorDefinitionInputBase.partial();
const DRAFT_FIELD_NAMES = Object.keys(DraftEvaluatorFields.shape) as Array<
  keyof z.infer<typeof DraftEvaluatorFields>
>;

const TestEvaluatorInputBase = z
  .object({
    evaluatorId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Saved evaluator ID. Provide this or a draft evaluator definition, but not both.",
      ),
    ...DraftEvaluatorFields.shape,
    observationId: z.string().min(1),
    traceId: z.string().min(1),
    startTime: z.iso.datetime({ offset: true }),
  })
  .strict();

const TestEvaluatorInput = TestEvaluatorInputBase.superRefine((input, ctx) => {
  const hasDraftDefinition = DRAFT_FIELD_NAMES.some(
    (field) => input[field] !== undefined,
  );

  if (Boolean(input.evaluatorId) === hasDraftDefinition) {
    ctx.addIssue({
      code: "custom",
      message:
        "Provide either evaluatorId or a draft evaluator definition, but not both.",
    });
    return;
  }

  if (!hasDraftDefinition) return;

  const parsedDraft = McpEvaluatorInput.safeParse({
    ...input,
    name: "Evaluator test",
  });
  if (parsedDraft.success) return;

  for (const issue of parsedDraft.error.issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
    });
  }
}).transform((input) => ({
  ...input,
  startTime: new Date(input.startTime),
}));

export const [testEvaluatorTool, handleTestEvaluator] = defineTool({
  name: "testEvaluator",
  description: [
    "Test an evaluator draft or the latest saved version of an evaluator against one observation in the current Langfuse project.",
    "For a saved evaluator, provide evaluatorId. For an unsaved draft, omit evaluatorId and provide type plus the matching LLM-as-a-judge or code evaluator fields.",
    "Pass the observationId, traceId, and startTime returned by the observation tools.",
    "This executes the evaluator, emits an internal trace, and may incur model or code execution cost.",
  ].join(" "),
  baseSchema: TestEvaluatorInputBase,
  inputSchema: TestEvaluatorInput,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.test",
      context,
      attributes: {
        ...(input.evaluatorId ? { "mcp.evaluator_id": input.evaluatorId } : {}),
        "mcp.observation_id": input.observationId,
      },
      fn: () => {
        const definition = input.evaluatorId
          ? undefined
          : toEvaluatorServiceInput(
              McpEvaluatorInput.parse({
                ...input,
                name: "Evaluator test",
              }),
            ).definition;

        return createMcpEvaluatorService(context).testEvaluator({
          orgId: context.orgId,
          projectId: context.projectId,
          evaluatorId: input.evaluatorId,
          definition,
          observationId: input.observationId,
          traceId: input.traceId,
          startTime: input.startTime,
        });
      },
    }),
  expensiveHint: true,
});
