import { z } from "zod";
import {
  EvaluatorCreateBase,
  PostUnstableEvaluatorBody,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import {
  PublicCodeEvaluatorDefinitionInput,
  PublicEvaluatorType,
  PublicLlmAsJudgeEvaluatorDefinitionInput,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import { createPublicEvaluator } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  EvaluatorModelConfigBaseSchema,
  EvaluatorOutputDefinitionBaseSchema,
} from "../schema";

// Superset (flattened) schema for client discovery. Both evaluator definition
// field sets are spread from the contract (via partial(), since each set is
// optional in the superset) so new contract fields are picked up automatically
// — drift surfaces as a guard/type failure rather than a silent omission. Only
// the union/nullable fields the MCP JSON-schema guard rejects are overridden;
// per-type "required" guidance lives in the tool description. The real per-type
// discriminated union is enforced at runtime by `inputSchema`
// (PostUnstableEvaluatorBody).
const CreateEvaluatorBaseSchema = z.object({
  ...EvaluatorCreateBase,
  type: PublicEvaluatorType.optional().describe(
    "Evaluator type. Defaults to `llm_as_judge` when omitted.",
  ),
  ...PublicLlmAsJudgeEvaluatorDefinitionInput.partial().shape,
  ...PublicCodeEvaluatorDefinitionInput.partial().shape,
  // outputDefinition is a discriminated union and modelConfig is nullable; both
  // become `anyOf` in JSON Schema, so replace them with union-free equivalents.
  outputDefinition: EvaluatorOutputDefinitionBaseSchema.optional(),
  modelConfig: EvaluatorModelConfigBaseSchema.optional(),
});

export const [createEvaluatorTool, handleCreateEvaluator] = defineTool({
  name: "createEvaluator",
  description: [
    "Create an evaluator in the current project.",
    "Set type to `llm_as_judge` (default) and provide prompt + outputDefinition (modelConfig optional), or set type to `code` and provide sourceCode + sourceCodeLanguage.",
    "Creating an evaluator with an existing name adds a new version and migrates evaluation rules that reference it.",
  ].join(" "),
  baseSchema: CreateEvaluatorBaseSchema,
  inputSchema: PostUnstableEvaluatorBody,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.create",
      context,
      attributes: {
        "mcp.evaluator_name": input.name,
        "mcp.evaluator_type": input.type,
      },
      fn: async (span) => {
        const evaluator = await createPublicEvaluator({
          projectId: context.projectId,
          input,
          auditScope: context,
        });

        span.setAttribute("mcp.evaluator_id", evaluator.id);

        return PostUnstableEvaluatorResponse.parse(evaluator);
      },
    }),
  destructiveHint: true,
});
