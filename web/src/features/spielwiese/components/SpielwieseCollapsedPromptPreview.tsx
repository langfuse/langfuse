import { cn } from "@/src/utils/tailwind";
import { getSpielwiesePromptPreviewText } from "./spielwiesePromptPreview";

export function SpielwieseCollapsedPromptPreview({
  className,
  value,
}: {
  className: string;
  value: string;
}) {
  return (
    <span
      className={cn(
        "block w-0 min-w-0 flex-1 truncate text-[14px] leading-[20px]",
        className,
      )}
    >
      {getSpielwiesePromptPreviewText(value)}
    </span>
  );
}
