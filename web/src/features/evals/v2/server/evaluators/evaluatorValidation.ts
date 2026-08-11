import { EvalTemplateType } from "@langfuse/shared";
import { getEvaluatorDefinitionConfigurationError } from "@/src/features/evals/server/evaluator-preflight";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import { EvaluatorConfigurationError } from "./evaluatorErrors";
import type { EvaluatorDefinition } from "./evaluatorTypes";

export async function assertEvaluatorConfigurationValid(params: {
  projectId: string;
  name: string;
  definition: EvaluatorDefinition;
}) {
  if (params.definition.type === EvalTemplateType.CODE) {
    if (!isCodeEvalEnabled()) {
      throw new EvaluatorConfigurationError(
        "Code evaluations are not enabled for this deployment.",
      );
    }
    if (
      !isCodeEvalSourceCodeLanguageSupported(
        params.definition.sourceCodeLanguage,
      )
    ) {
      throw new EvaluatorConfigurationError(
        "This code evaluator language is not supported by the configured dispatcher.",
      );
    }
    return;
  }

  const error = await getEvaluatorDefinitionConfigurationError({
    projectId: params.projectId,
    template: {
      name: params.name,
      type: params.definition.type,
      provider: params.definition.provider,
      model: params.definition.model,
      modelParams: params.definition.modelParams,
      outputDefinition: params.definition.outputDefinition,
    },
  });
  if (error) throw new EvaluatorConfigurationError(error);
}
