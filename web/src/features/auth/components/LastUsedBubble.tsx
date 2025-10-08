import { cn } from "@/src/utils/tailwind";

interface LastUsedBubbleProps {
  visible: boolean;
}

/**
 * Displays a "Last used" indicator below authentication provider buttons.
 * Used to help users quickly identify their most recently used login method.
 */
export function LastUsedBubble({ visible }: LastUsedBubbleProps) {
  return (
    <div
      className={cn(
        "mt-0.5 text-center text-xs text-muted-foreground",
        visible ? "visible" : "invisible",
      )}
    >
      Last used
    </div>
  );
}
