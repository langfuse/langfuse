import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

/**
 * Content that belongs to the previous item while the next one loads: dimmed,
 * and `inert` so it takes no pointer, keyboard or focus input.
 */
export function StaleContent({
  stale,
  fill = false,
  children,
}: {
  stale: boolean;
  /** Fill the parent (panel content) instead of hugging it (a button row). */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={stale}
      className={cn(
        fill && "h-full w-full",
        stale && "pointer-events-none opacity-60 select-none",
      )}
    >
      {children}
    </div>
  );
}
