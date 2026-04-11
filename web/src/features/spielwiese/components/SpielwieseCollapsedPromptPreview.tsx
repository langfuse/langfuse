import { cn } from "@/src/utils/tailwind";
import {
  getSpielwiesePromptPreviewText,
  useSpielwiesePromptPreviewMetrics,
} from "./spielwiesePromptPreview";

export function SpielwieseCollapsedPromptPreview({
  className,
  value,
}: {
  className: string;
  value: string;
}) {
  const { metrics, setNode } = useSpielwiesePromptPreviewMetrics();

  return (
    <span
      ref={setNode}
      className={cn(
        "block w-0 min-w-0 flex-1 truncate text-[14px] leading-[20px]",
        className,
      )}
    >
      {getSpielwiesePromptPreviewText(value, metrics)}
    </span>
  );
}
