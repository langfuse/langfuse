import { cn } from "@/src/utils/tailwind";

interface LastUsedBubbleProps {
  visible: boolean;
  /**
   * Controls how the component handles visibility:
   * - 'visibility': Uses CSS visibility (preserves layout space)
   * - 'display': Uses CSS display (collapses/expands element)
   * @default 'visibility'
   */
  displayMode?: "visibility" | "display";
  /**
   * Additional CSS classes to apply to the container
   */
  className?: string;
}

/**
 * Displays a "Last used" indicator below authentication provider buttons.
 * Used to help users quickly identify their most recently used login method.
 */
export function LastUsedBubble({
  visible,
  displayMode = "visibility",
  className,
}: LastUsedBubbleProps) {
  const visibilityClasses =
    displayMode === "display"
      ? visible
        ? "block"
        : "hidden"
      : visible
        ? "visible"
        : "invisible";

  return (
    <div
      className={cn(
        "mt-0.5 text-center text-xs text-muted-foreground",
        visibilityClasses,
        className,
      )}
    >
      Last used
    </div>
  );
}
