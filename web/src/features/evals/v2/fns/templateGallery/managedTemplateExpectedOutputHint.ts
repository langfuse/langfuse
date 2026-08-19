import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import type { ExpectedOutputHint } from "@/src/features/evals/v2/types/templateGallery";

export function managedTemplateExpectedOutputHint(
  templateKey: string | null | undefined,
): ExpectedOutputHint | undefined {
  if (!templateKey) return undefined;

  const template = managedEvaluatorTemplateService.get(templateKey);
  if (template?.evaluator.type !== EvalTemplateTypeEnum.CODE) {
    return undefined;
  }

  return template.expectedOutputHint;
}
