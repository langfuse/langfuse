import type { ReactNode } from "react";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { cn } from "@/src/utils/tailwind";

export function SectionHeader({
  title,
  meta,
  description,
  tooltip,
  trailing,
  trailingLayout = "inline",
}: {
  title: string;
  meta: ReactNode;
  description: string | null;
  tooltip: string;
  trailing: ReactNode;
  /** "wrap" moves the trailing control below the description when space is tight. */
  trailingLayout?: "inline" | "wrap";
}) {
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="shrink-0 text-sm font-bold whitespace-nowrap">
          {title}
        </h3>
        {meta}
        <InfoTooltip label={`About ${title}`}>{tooltip}</InfoTooltip>
      </div>
      {description || trailing ? (
        <div
          className={cn(
            "flex items-center gap-2",
            trailingLayout === "wrap" && "flex-wrap",
          )}
        >
          {description ? (
            <p
              className={cn(
                "text-muted-foreground min-w-0 flex-1 text-sm",
                trailingLayout === "wrap" && "basis-56",
              )}
            >
              {description}
            </p>
          ) : null}
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
