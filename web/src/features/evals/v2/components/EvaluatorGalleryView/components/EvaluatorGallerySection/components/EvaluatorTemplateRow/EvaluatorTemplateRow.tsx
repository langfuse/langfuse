import { Eye } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorTemplateRow({
  template,
  categoryKey,
  onSelect,
}: {
  template: GalleryTemplate;
  categoryKey: string;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const {
    description,
    type,
    returnTypeLabel,
    expectedOutputHint,
    attribution,
  } = getGalleryTemplatePresentation(template);
  const { icon: Icon, iconClassName } =
    getGalleryCategoryPresentation(categoryKey);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-1 py-2.5 text-left transition-colors"
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
      <span
        className="max-w-[14rem] shrink-0 truncate text-sm font-bold"
        title={template.name}
      >
        {template.name}
      </span>
      <p
        className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
        title={
          attribution ? `${description ?? ""} ${attribution}` : description
        }
      >
        {description}
        {attribution ? (
          <span className="text-muted-foreground/80"> · {attribution}</span>
        ) : null}
      </p>
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
        <EvaluatorGalleryMethodBadge type={type} />
        {returnTypeLabel ? (
          <span className="text-muted-foreground hidden min-w-20 text-right text-xs tracking-wide uppercase sm:inline">
            {returnTypeLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
