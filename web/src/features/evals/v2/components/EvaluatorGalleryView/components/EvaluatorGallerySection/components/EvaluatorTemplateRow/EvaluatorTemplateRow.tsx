import { Eye } from "lucide-react";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { cn } from "@/src/utils/tailwind";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorTemplateRow({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const {
    description,
    type,
    icon: Icon,
    returnTypeLabel,
    expectedOutputHint,
    attribution,
  } = getGalleryTemplatePresentation(template);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:border-primary hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          type === EvalTemplateTypeEnum.CODE
            ? "bg-light-blue/40 text-dark-blue"
            : "bg-light-violet text-dark-violet",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold" title={template.name}>
          {template.name}
        </span>
        <p
          className="text-muted-foreground line-clamp-1 text-sm leading-relaxed"
          title={description}
        >
          {description}
        </p>
        {attribution ? (
          <p
            className="text-muted-foreground/80 truncate text-xs"
            title={attribution}
          >
            {attribution}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {expectedOutputHint ? (
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
        ) : null}
        <EvaluatorTypeBadge type={type} />
        {returnTypeLabel ? (
          <span className="text-muted-foreground hidden text-xs font-bold tracking-wide uppercase sm:inline">
            {returnTypeLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
