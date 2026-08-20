"use client";

import { useMemo } from "react";
import { cn } from "@/src/utils/tailwind";

export function InAppAgentToolPayload({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "default" | "failed" | "denied";
}) {
  const toolPayload = useMemo(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "{}";
    }

    try {
      return JSON.stringify(JSON.parse(trimmedValue), null, 2);
    } catch {
      return value;
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-xs font-bold",
          variant === "default" && "text-muted-foreground",
          variant === "failed" && "text-destructive",
          variant === "denied" && "text-dark-yellow",
        )}
      >
        {label}
      </p>
      <pre
        className={cn(
          "max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap",
          variant === "default" && "bg-muted text-muted-foreground",
          variant === "failed" && "bg-destructive/10 text-destructive",
          variant === "denied" && "bg-light-yellow text-dark-yellow",
        )}
      >
        {toolPayload}
      </pre>
    </div>
  );
}
