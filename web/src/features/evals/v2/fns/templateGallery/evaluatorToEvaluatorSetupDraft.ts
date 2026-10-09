import type { RouterOutputs } from "@/src/utils/api";
import type { EvaluatorSetupDraft } from "@/src/features/evals/v2/types/templateGallery";

type EvaluatorGet = RouterOutputs["evalsV2"]["get"];
type EvaluatorVersionRow = EvaluatorGet["versions"][number];

function toEvaluatorSetupDefinition(
  type: EvaluatorGet["type"],
  latest: EvaluatorVersionRow,
): EvaluatorSetupDraft["definition"] | null {
  switch (type) {
    case "LLM_AS_JUDGE":
      return {
        type,
        promptMessages: latest.promptMessages!,
        provider: latest.provider,
        model: latest.model,
        modelParams: latest.modelParams,
        vars: latest.vars ?? [],
        variableMapping: latest.variableMapping,
        outputDefinition: latest.outputDefinition,
      } as EvaluatorSetupDraft["definition"];
    case "DECISION_MODEL":
      return {
        type,
        questions: latest.questions,
        provider: latest.provider ?? "",
        model: latest.model ?? "",
        vars: latest.vars ?? [],
        variableMapping: latest.variableMapping,
      } as EvaluatorSetupDraft["definition"];
    case "CODE":
      return {
        type,
        sourceCode: latest.sourceCode ?? "",
        sourceCodeLanguage: latest.sourceCodeLanguage ?? "TYPESCRIPT",
      };
    case "FACET":
      return null;
  }
}

export function evaluatorToEvaluatorSetupDraft(
  evaluator: EvaluatorGet,
): EvaluatorSetupDraft | null {
  const latest = evaluator.versions[0];
  if (!latest) return null;

  const definition = toEvaluatorSetupDefinition(evaluator.type, latest);
  if (!definition) return null;

  return {
    name: evaluator.name,
    description: evaluator.description,
    definition,
  };
}
