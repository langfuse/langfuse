import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import {
  EVALUATOR_EMPTY_STATE_DOCS_HREF,
  EVALUATOR_EMPTY_STATE_STARTING_POINTS,
} from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

export type EvaluatorEmptyStateStartingPoint = {
  template: Extract<GalleryTemplate, { source: "managed" }>;
  title: string;
  description: string;
  audience: string;
  categoryKey: string;
};

export type EvaluatorEmptyStateModel = {
  startingPoints: EvaluatorEmptyStateStartingPoint[];
  templateCount: number;
  docsHref: string;
};

export function prepareEvaluatorEmptyState(): EvaluatorEmptyStateModel {
  return {
    startingPoints: EVALUATOR_EMPTY_STATE_STARTING_POINTS.flatMap((point) => {
      const template = managedEvaluatorTemplateService.get(point.templateKey);
      return template
        ? [
            {
              template: { source: "managed" as const, ...template },
              title: point.title,
              description: point.description,
              audience: point.audience,
              categoryKey: point.categoryKey,
            },
          ]
        : [];
    }),
    templateCount: MANAGED_TEMPLATES_CATALOG.templates.length,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
  };
}
