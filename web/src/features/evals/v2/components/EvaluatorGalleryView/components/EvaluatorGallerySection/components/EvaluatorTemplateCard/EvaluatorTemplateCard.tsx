import { formatDistanceToNowStrict } from "date-fns";
import { Eye } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import type {
  CustomEvaluatorTemplate,
  ExpectedOutputHint,
  GalleryTemplate,
  ManagedTemplate,
} from "@/src/features/evals/v2/types/templateGallery";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";

/** What the card shows, resolved from whichever source the entry came from. */
type TemplateCardContent = {
  description: string | undefined;
  type: EvalTemplateType;
  expectedOutputHint?: ExpectedOutputHint;
  attribution: string | null;
};

function managedCardContent(template: ManagedTemplate): TemplateCardContent {
  return {
    description: template.description,
    type: template.evaluator.type,
    expectedOutputHint: template.expectedOutputHint,
    attribution: null,
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
    expectedOutputHint: undefined,
    attribution: author ? `by ${author} · ${updated}` : `Updated ${updated}`,
  };
}

export function EvaluatorTemplateCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type, expectedOutputHint, attribution } =
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
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm font-bold"
            title={template.name}
          >
            {template.name}
          </span>
          <span className="shrink-0">
            <EvaluatorTypeBadge type={type} />
          </span>
        </div>
        <div className="mt-1">
          <p
            className="text-muted-foreground line-clamp-2 text-sm leading-relaxed"
            title={description}
          >
            {description}
          </p>
        </div>
        {expectedOutputHint ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center">
                  <Eye className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm p-3">
                <p className="font-bold">Expected output shape</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {expectedOutputHint.shape}
                </p>
                {expectedOutputHint.example ? (
                  <code className="bg-muted mt-2 block rounded px-2 py-1 text-xs whitespace-pre-wrap">
                    {expectedOutputHint.example}
                  </code>
                ) : null}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        {attribution ? (
          <p className="text-muted-foreground/80 mt-2 flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate" title={attribution}>
              {attribution}
            </span>
          </p>
        ) : null}
      </div>
    </button>
  );
}
