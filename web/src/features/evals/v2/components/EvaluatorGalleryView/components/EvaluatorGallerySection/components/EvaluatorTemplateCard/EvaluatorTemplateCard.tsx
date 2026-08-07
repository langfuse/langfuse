import { formatDistanceToNowStrict } from "date-fns";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import type {
  CustomEvaluatorTemplate,
  GalleryTemplate,
} from "@/src/features/evals/v2/components/EvaluatorGalleryView/types";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import {
  LANGFUSE_MAINTAINER,
  type ManagedTemplate,
} from "@/src/features/evals/v2/managedTemplatesCatalog";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/sourceCodeLanguageLabel";

/** What the card shows, resolved from whichever source the entry came from. */
type TemplateCardContent = {
  description: string | undefined;
  type: EvalTemplateType;
  attribution: string | null;
  byLangfuse: boolean;
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function managedCardContent(template: ManagedTemplate): TemplateCardContent {
  const byLangfuse = template.maintainer === LANGFUSE_MAINTAINER;

  return {
    description: template.description,
    type: template.evaluator.type,
    attribution: `by ${byLangfuse ? "Langfuse" : capitalize(template.maintainer)}`,
    byLangfuse,
  };
}

function customCardContent(
  template: CustomEvaluatorTemplate,
): TemplateCardContent {
  // A code evaluator has no prompt to describe itself with, so name its
  // language instead.
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
    attribution: author ? `by ${author} · ${updated}` : `Updated ${updated}`,
    byLangfuse: false,
  };
}

export function EvaluatorTemplateCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type, attribution, byLangfuse } =
    template.source === "managed"
      ? managedCardContent(template)
      : customCardContent(template);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:border-primary hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 pt-3.5 pb-2 text-left transition-all"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-bold" title={template.name}>
            {template.name}
          </span>
          <p
            className="text-muted-foreground line-clamp-1 text-sm leading-relaxed"
            title={description}
          >
            {description}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {attribution ? (
            <p className="text-muted-foreground/80 flex min-w-0 items-center gap-1.5 text-sm">
              {byLangfuse ? <LangfuseIcon size={14} /> : null}
              <span className="truncate" title={attribution}>
                {attribution}
              </span>
            </p>
          ) : null}
          <span className="ml-auto shrink-0">
            <EvaluatorTypeBadge type={type} />
          </span>
        </div>
      </div>
    </button>
  );
}
