import type { ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

const NOTICE_TONE_CLASSES = {
  neutral: "border-border bg-muted/60 text-foreground",
  warning: "border-dark-yellow/40 bg-light-yellow text-dark-yellow",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

/**
 * Composer-adjacent notice chrome. Margin lives here because this is the
 * notice band: showing it must not shift the composer or the run indicator.
 */
export function InAppAgentNotice({
  action,
  children,
  icon,
  isExpanded,
  role,
  tone,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  isExpanded: boolean;
  role: "status" | "alert";
  tone: keyof typeof NOTICE_TONE_CLASSES;
}) {
  return (
    <div className="shrink-0 px-1.5 pb-2">
      <div className={cn(isExpanded && "mx-auto max-w-3xl")}>
        <div
          role={role}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border px-2 py-1",
            isExpanded ? "text-sm" : "text-xs",
            NOTICE_TONE_CLASSES[tone],
          )}
        >
          <span className="flex items-center self-stretch">{icon}</span>
          <span className="min-w-0 flex-1 leading-snug">{children}</span>
          {action}
        </div>
      </div>
    </div>
  );
}
