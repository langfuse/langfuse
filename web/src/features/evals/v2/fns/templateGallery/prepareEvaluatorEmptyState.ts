import { MANAGED_TEMPLATES_CATALOG } from "../../constants/managedTemplatesCatalog";
import {
  EVALUATOR_EMPTY_STATE_DOCS_HREF,
  EVALUATOR_EMPTY_STATE_STARTING_POINTS,
} from "../../constants/evaluatorEmptyState";
import { managedEvaluatorTemplateService } from "./managedEvaluatorTemplateService";
import type { GalleryTemplate } from "../../types/templateGallery";

type ManagedGalleryTemplate = Extract<GalleryTemplate, { source: "managed" }>;

export type EvaluatorEmptyStateStartingPoint =
  | {
      action: "detect-topics";
      template: ManagedGalleryTemplate;
      title: string;
      description: string;
    }
  | {
      action: "select-template";
      template: ManagedGalleryTemplate;
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
  const galleryTemplate = { source: "managed" as const, ...template };

  if (point.action === "detect-topics") {
    return {
      action: "detect-topics",
      template: galleryTemplate,
      title: point.title,
      description: point.description,
    };
  }

  return {
    action: "select-template",
    template: galleryTemplate,
  };
}
