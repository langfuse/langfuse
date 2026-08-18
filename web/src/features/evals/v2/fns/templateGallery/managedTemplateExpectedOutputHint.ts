import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import type { ExpectedOutputHint } from "@/src/features/evals/v2/types/templateGallery";

export function managedTemplateExpectedOutputHint(
  templateKey: string | null | undefined,
): ExpectedOutputHint | undefined {
  if (!templateKey) return undefined;

  return managedEvaluatorTemplateService.get(templateKey)?.expectedOutputHint;
}
