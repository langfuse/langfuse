import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import {
  EVALUATOR_EMPTY_STATE_DOCS_HREF,
  EVALUATOR_EMPTY_STATE_STARTING_POINTS,
} from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

type EvaluatorEmptyStateStartingPointBase = {
  template: Extract<GalleryTemplate, { source: "managed" }>;
  title: string;
  description: string;
};

export type EvaluatorEmptyStateStartingPoint =
  | (EvaluatorEmptyStateStartingPointBase & { action: "detect-topics" })
  | (EvaluatorEmptyStateStartingPointBase & { action: "select-template" });

export type EvaluatorEmptyStateModel = {
  startingPoints: EvaluatorEmptyStateStartingPoint[];
  templateCount: number;
  docsHref: string;
};

export function prepareEvaluatorEmptyState(): EvaluatorEmptyStateModel {
  return {
    startingPoints: EVALUATOR_EMPTY_STATE_STARTING_POINTS.flatMap((point) => {
      const template = managedEvaluatorTemplateService.get(point.templateKey);
      return template ? [toStartingPoint(point, template)] : [];
    }),
    templateCount: MANAGED_TEMPLATES_CATALOG.templates.length,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
  };
}

function toStartingPoint(
  point: (typeof EVALUATOR_EMPTY_STATE_STARTING_POINTS)[number],
  template: NonNullable<ReturnType<typeof managedEvaluatorTemplateService.get>>,
): EvaluatorEmptyStateStartingPoint {
  const shared = {
    template: { source: "managed" as const, ...template },
    title: point.title,
    description: point.description,
  };

  if (point.action === "detect-topics") {
    return { action: "detect-topics", ...shared };
  }

  return { action: "select-template", ...shared };
}
