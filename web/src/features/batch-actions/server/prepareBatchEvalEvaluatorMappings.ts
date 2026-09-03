import {
  EvalTemplateType,
  InvalidRequestError,
  type BatchEvalEvaluatorMapping,
} from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { findEvaluatorsByIds } from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import { reconcileEvaluatorPromptMessages } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  assertCompleteEvaluatorVariableMapping,
  extractEvaluatorPromptVariables,
} from "@/src/features/evals/v2/server/evaluators/evaluatorValidation";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";

export async function prepareBatchEvalEvaluatorMappings(params: {
  prisma: PrismaClient;
  projectId: string;
  mappings: BatchEvalEvaluatorMapping[];
}): Promise<BatchEvalEvaluatorMapping[]> {
  const { prisma, projectId, mappings } = params;
  const evaluatorIds = mappings.map(({ evaluatorId }) => evaluatorId);
  const evaluators = await findEvaluatorsByIds({
    prisma,
    projectId,
    evaluatorIds,
  });
  if (evaluators.length !== evaluatorIds.length) {
    throw new InvalidRequestError(
      "Selected evaluators are missing or incompatible with batch evaluation.",
    );
  }

  const evaluatorById = new Map(
    evaluators.map((evaluator) => [evaluator.id, evaluator]),
  );

  return mappings.map((mapping) => {
    const evaluator = evaluatorById.get(mapping.evaluatorId);
    if (!evaluator) {
      throw new InvalidRequestError(
        "Selected evaluators are missing or incompatible with batch evaluation.",
      );
    }
    try {
      const latestVersion = evaluator.versions[0];
      if (!latestVersion) {
        throw new InvalidRequestError("Evaluator version not found");
      }

      if (evaluator.type === EvalTemplateType.CODE) {
        if (mapping.variableMapping !== null) {
          throw new InvalidRequestError(
            "Code evaluator mappings are managed by Langfuse and cannot be provided.",
          );
        }
        return {
          evaluatorId: mapping.evaluatorId,
          variableMapping: null,
        };
      }

      const prepared = prepareModernRuleVariableMapping(
        latestVersion.variableMapping,
        evaluator.type,
      );
      const storedVariableMapping =
        mapping.variableMapping ?? prepared.initialVariableMapping;
      const promptMessages = reconcileEvaluatorPromptMessages({
        prompt: latestVersion.prompt,
        promptMessages: latestVersion.promptMessages,
      });
      assertCompleteEvaluatorVariableMapping({
        promptVariables: extractEvaluatorPromptVariables(promptMessages),
        variableMapping:
          storedVariableMapping ?? prepared.defaultVariableMapping,
      });

      return {
        evaluatorId: mapping.evaluatorId,
        variableMapping: storedVariableMapping,
      };
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        throw new InvalidRequestError(
          `Evaluator "${evaluator.name}": ${error.message}`,
        );
      }
      throw error;
    }
  });
}
