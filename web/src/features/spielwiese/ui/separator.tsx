import type { HTMLAttributes } from "react";
import { cn } from "@/src/utils/tailwind";

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <div
      aria-orientation={orientation}
      className={cn(
        orientation === "horizontal"
          ? "bg-border/70 h-px w-full"
          : "bg-border/70 h-full w-px self-stretch",
        className,
      )}
      role="separator"
      {...props}
    />
  );
}
