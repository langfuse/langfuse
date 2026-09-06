import { formatDistanceToNowStrict } from "date-fns";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import type {
  CustomEvaluatorTemplate,
  GalleryTemplate,
  ManagedTemplate,
} from "@/src/features/evals/v2/types/templateGallery";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";
import { EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";

export type GalleryTemplatePresentation = {
  description: string | undefined;
  type: EvalTemplateType;
  attribution: string | null;
};

function managedPresentation(
  template: ManagedTemplate,
): GalleryTemplatePresentation {
  return {
    description: template.description,
    type: template.evaluator.type,
    attribution: null,
  };
}

function customPresentation(
  template: CustomEvaluatorTemplate,
): GalleryTemplatePresentation {
  const codeFallback =
    template.type === EvalTemplateTypeEnum.CODE
      ? `${sourceCodeLanguageLabel(template.sourceCodeLanguage)} evaluator${
          template.version > 1 ? ` · version ${template.version}` : ""
        }`
      : undefined;
  const author =
    template.createdByUser?.name ?? template.createdByUser?.email ?? null;
  const updated = formatDistanceToNowStrict(new Date(template.updatedAt), {
    addSuffix: true,
  });

  return {
    description: template.description?.trim()
      ? template.description
      : codeFallback,
    type: template.type,
    attribution: author ? `${author} · ${updated}` : `Updated ${updated}`,
  };
}

export function getGalleryTemplatePresentation(
  template: GalleryTemplate,
): GalleryTemplatePresentation {
  return template.source === "managed"
    ? managedPresentation(template)
    : customPresentation(template);
}

export function getGalleryTemplateId(template: GalleryTemplate) {
  return template.source === "managed" ? template.key : template.id;
}

export function getGalleryTemplateCategoryKey(template: GalleryTemplate) {
  return template.source === "managed"
    ? template.categories.find(
        (category) => category !== EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
      )
    : undefined;
}
