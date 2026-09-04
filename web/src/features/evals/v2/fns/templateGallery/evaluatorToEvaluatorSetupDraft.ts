import type { RouterOutputs } from "@/src/utils/api";
import type { EvaluatorSetupDraft } from "@/src/features/evals/v2/types/templateGallery";

export function evaluatorToEvaluatorSetupDraft(
  evaluator: RouterOutputs["evalsV2"]["get"],
): EvaluatorSetupDraft | null {
  const latest = evaluator.versions[0];
  if (!latest) return null;

  const definition =
    evaluator.type === "LLM_AS_JUDGE"
      ? {
          type: evaluator.type,
          promptMessages: latest.promptMessages,
          provider: latest.provider,
          model: latest.model,
          modelParams: latest.modelParams,
          vars: latest.vars,
          variableMapping: latest.variableMapping,
          outputDefinition: latest.outputDefinition,
        }
      : {
          type: evaluator.type,
          sourceCode: latest.sourceCode ?? "",
          sourceCodeLanguage: latest.sourceCodeLanguage ?? "TYPESCRIPT",
        };

  return {
    name: evaluator.name,
    description: evaluator.description,
    definition: definition as EvaluatorSetupDraft["definition"],
  };
}
