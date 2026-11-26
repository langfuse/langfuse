import type { ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

/** One labelled row of an evaluator definition. Labels share a column so the controls line up. */
export function FieldRow({
  label,
  align = "center",
  children,
}: {
  label: string;
  /** "start" pins the label to the first line of a tall control. */
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 text-sm",
        align === "center" ? "items-center" : "items-start",
      )}
    >
      <span
        className={cn(
          "text-muted-foreground w-16 shrink-0 font-bold",
          align === "start" && "pt-2",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "min-w-0 flex-1",
          align === "center" && "flex flex-wrap items-center gap-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}
