import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import type { ExpectedOutputHint } from "@/src/features/evals/v2/types/templateGallery";

export function ExpectedOutputUsageHint({
  hint,
}: {
  hint: ExpectedOutputHint;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-help text-sm underline-offset-4 hover:underline"
        >
          How can I use this?
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm p-3">
        <p className="font-bold">Expected output shape</p>
        <p className="text-muted-foreground mt-1 text-sm">{hint.shape}</p>
        {hint.example ? (
          <code className="bg-muted mt-2 block rounded px-2 py-1 text-xs whitespace-pre-wrap">
            {hint.example}
          </code>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
