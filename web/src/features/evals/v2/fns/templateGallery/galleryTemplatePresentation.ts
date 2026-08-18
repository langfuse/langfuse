import { formatDistanceToNowStrict } from "date-fns";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import type {
  CustomEvaluatorTemplate,
  GalleryTemplate,
  ManagedTemplate,
  TemplateRunTarget,
} from "@/src/features/evals/v2/types/templateGallery";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";

export type GalleryTemplatePresentation = {
  description: string | undefined;
  type: EvalTemplateType;
  runsOn: TemplateRunTarget[] | null;
  attribution: string | null;
};

function managedPresentation(
  template: ManagedTemplate,
): GalleryTemplatePresentation {
  return {
    description: template.description,
    type: template.evaluator.type,
    runsOn: template.runsOn,
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
    description: template.prompt?.trim() ? template.prompt : codeFallback,
    type: template.type,
    runsOn: null,
    attribution: author ? `by ${author} · ${updated}` : `Updated ${updated}`,
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
