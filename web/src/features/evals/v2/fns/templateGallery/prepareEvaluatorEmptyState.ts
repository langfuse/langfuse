import {
  EVALUATOR_EMPTY_STATE_DOCS_HREF,
  EVALUATOR_EMPTY_STATE_TEMPLATE_KEYS,
} from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

type ManagedGalleryTemplate = Extract<GalleryTemplate, { source: "managed" }>;

export type EvaluatorEmptyStateModel = {
  startingPoints: ManagedGalleryTemplate[];
  docsHref: string;
};

export function prepareEvaluatorEmptyState(): EvaluatorEmptyStateModel {
  return {
    startingPoints: EVALUATOR_EMPTY_STATE_TEMPLATE_KEYS.flatMap((key) => {
      const template = managedEvaluatorTemplateService.get(key);
      return template ? [{ source: "managed" as const, ...template }] : [];
    }),
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
  };
}
