import type { ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

/** One labelled row of an evaluator definition. Labels share a column so the controls line up. */
export function FieldRow({
  label,
  info,
  hint,
  size = "default",
  align = "center",
  children,
}: {
  label: string;
  /** An info tooltip trigger after the label. */
  info?: ReactNode;
  /** A quieter second line under the label. */
  hint?: string;
  /** `wide` fits two-word labels with an info icon. */
  size?: "default" | "wide";
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
          "text-muted-foreground flex shrink-0 flex-col font-bold",
          size === "wide" ? "w-28" : "w-16",
          align === "start" && "pt-2",
        )}
      >
        <span className="flex items-center gap-1">
          {label}
          {info}
        </span>
        {hint ? <span className="text-xs font-normal">{hint}</span> : null}
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
