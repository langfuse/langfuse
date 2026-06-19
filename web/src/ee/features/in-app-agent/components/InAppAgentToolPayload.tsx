"use client";

import { useMemo } from "react";
import { cn } from "@/src/utils/tailwind";

export function InAppAgentToolPayload({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
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
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <pre
        className={cn(
          "bg-muted text-muted-foreground max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap",
          isError && "text-destructive",
        )}
      >
        {toolPayload}
      </pre>
    </div>
  );
}
