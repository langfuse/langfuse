import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

/** InlineCode renders a code fragment inside help text. */
export function InlineCode({
  children,
  isShaded = false,
}: {
  children: ReactNode;
  isShaded?: boolean;
}) {
  return (
    <code
      className={cn(
        "font-mono text-xs",
        isShaded && "bg-muted rounded-md px-1 py-px",
      )}
    >
      {children}
    </code>
  );
}
