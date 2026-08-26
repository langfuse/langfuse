import type { EvalTemplateType } from "@langfuse/shared";

export type EvaluatorCreationSource =
  | { type: "managed"; templateKey: string }
  | { type: "custom" }
  | { type: "scratch" }
  | { type: "assistant" };

export function getEvaluatorCreationAnalyticsProperties({
  evaluatorType,
  creationSource,
}: {
  evaluatorType: EvalTemplateType;
  creationSource: EvaluatorCreationSource;
}) {
  if (creationSource.type === "managed") {
    return {
      evaluatorType,
      managedTemplateKey: creationSource.templateKey,
      isCustomTemplate: false,
      isFromScratch: false,
      isFromAssistant: false,
    };
  }

  return {
    evaluatorType,
    isCustomTemplate: creationSource.type === "custom",
    isFromScratch: creationSource.type === "scratch",
    isFromAssistant: creationSource.type === "assistant",
  };
}
