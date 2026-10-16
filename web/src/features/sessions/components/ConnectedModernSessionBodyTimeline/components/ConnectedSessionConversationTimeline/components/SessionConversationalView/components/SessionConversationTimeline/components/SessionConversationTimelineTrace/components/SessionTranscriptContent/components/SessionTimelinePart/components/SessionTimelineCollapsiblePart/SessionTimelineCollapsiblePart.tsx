/* eslint-disable no-nested-ternary */
import React, { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

export function SessionTimelineCollapsiblePart({
  label,
  icon: Icon,
  status,
  variant,
  alignment,
  trailingContent,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  status?: "success" | "error";
  variant: "plain" | "card";
  alignment: "start" | "center" | "row";
  trailingContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden",
        (alignment === "center" || alignment === "row") && "w-full",
        variant === "card" &&
          "border-border bg-background/80 w-fit max-w-full rounded-md border px-2",
      )}
    >
      <div className={cn(alignment === "row" && "flex items-center gap-4")}>
        <button
          type="button"
          className={cn(
            "flex max-w-full items-center gap-1.5 py-1 text-left font-mono text-xs transition-colors hover:opacity-80",
            alignment === "row" ? "text-muted-foreground" : "text-foreground",
            alignment === "center" && "mx-auto",
            alignment === "start" ? "font-bold" : "font-normal",
          )}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {Icon ? <Icon className="icon-sm shrink-0" /> : null}
          <span className="truncate" title={label}>
            {label}
          </span>
          {status === "success" ? (
            <Check className="icon-sm shrink-0" aria-label="Succeeded" />
          ) : status === "error" ? (
            <X
              className="text-destructive icon-sm shrink-0"
              aria-label="Failed"
            />
          ) : null}
          <ChevronDown
            className={cn(
              "text-foreground-tertiary icon-sm shrink-0 translate-y-px transition-transform",
              !isExpanded && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        {trailingContent ? (
          <div className="ml-auto shrink-0">{trailingContent}</div>
        ) : null}
      </div>
      {isExpanded ? (
        <div
          className={cn(
            "py-2",
            alignment === "center"
              ? "mx-auto w-fit max-w-full"
              : alignment === "start"
                ? "border-border ml-1.5 border-l pl-4"
                : "w-full",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
